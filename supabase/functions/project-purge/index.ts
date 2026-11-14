import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Removes deleted projects for good, files included.
 *
 * Runs nightly from pg_cron (job `project-purge`). Two passes:
 *
 * 1. Purge. Every project that has been in the bin for 30 days: delete its
 *    uploaded files from R2, then delete the project. The row goes only once
 *    every one of its files is confirmed gone, so a storage hiccup leaves the
 *    project for tomorrow's run rather than leaving files nobody points at.
 *
 * 2. Sweep. Anything under `projects/` in the bucket that no record points at
 *    and that is more than a day old is deleted. This is what catches a draft
 *    a student withdrew, a hand-added archive entry that was removed, and
 *    anything pass 1 could not account for. The day's grace protects an upload
 *    whose record has not been written yet.
 *
 * The caller is not authenticated (cron sends no JWT). That is safe because
 * the request chooses nothing: what is deleted is decided entirely from the
 * database. `{ "dry_run": true }` reports what a run would do and deletes
 * nothing. Responses carry counts only, never file names.
 */

const PREFIX = "projects/";
const RETENTION_DAYS = 30;
const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const encodeKey = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function r2() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET_NAME");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2 is not fully configured");
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    bucketUrl: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  };
}

type Store = ReturnType<typeof r2>;
// deno-lint-ignore no-explicit-any
type Admin = any;

/** True when the object is gone afterwards: deleted now, or never there. */
async function removeObject(store: Store, key: string): Promise<boolean> {
  // Never outside the projects folder, whatever a row says.
  if (!key.startsWith(PREFIX) || key.includes("..")) return false;
  const res = await store.client.fetch(`${store.bucketUrl}/${encodeKey(key)}`, { method: "DELETE" });
  await res.body?.cancel();
  return res.ok || res.status === 404;
}

/** Every value of one column, paged past the 1,000-row select limit. Throws on any failed read. */
async function allValues(admin: Admin, table: string, column: string): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(column).not(column, "is", null).range(from, from + 999);
    if (error) throw new Error(`Could not read ${table}.${column}: ${error.message}`);
    for (const row of data ?? []) out.push(row[column] as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function listProjectObjects(store: Store): Promise<{ key: string; lastModified: number }[]> {
  const objects: { key: string; lastModified: number }[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ "list-type": "2", "max-keys": "1000", prefix: PREFIX });
    if (token) qs.set("continuation-token", token);
    const res = await store.client.fetch(`${store.bucketUrl}?${qs.toString()}`, { method: "GET" });
    if (!res.ok) throw new Error(`R2 list failed (${res.status}): ${await res.text()}`);
    const xml = await res.text();
    pages++;
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = m[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "";
      const modified = Date.parse(m[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "");
      // ListObjectsV2 XML-escapes keys; undo the five entities it uses.
      const plain = key
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
      if (plain) objects.push({ key: plain, lastModified: modified });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]
      : undefined;
    // A listing cut short would make live files look missing from it, which is
    // harmless here (the sweep only deletes what it has listed), so stopping is safe.
  } while (token && pages < 200);
  return objects;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const body = await req.json().catch(() => ({}));
  const dryRun = (body as { dry_run?: boolean }).dry_run === true;

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const store = r2();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // ---- Pass 1: projects whose 30 days are up --------------------------------
    const { data: due, error: dueError } = await admin
      .from("projects")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff)
      .limit(200);
    if (dueError) throw new Error(`Could not read deleted projects: ${dueError.message}`);

    let projectsPurged = 0;
    let projectsHeld = 0;
    let filesDeleted = 0;

    for (const project of due ?? []) {
      const { data: files, error: filesError } = await admin
        .from("project_submissions")
        .select("file_path")
        .eq("project_id", project.id);
      if (filesError) {
        projectsHeld++;
        console.error("purge: could not read files for", project.id, filesError.message);
        continue;
      }
      const keys = [...new Set((files ?? []).map((f: { file_path: string }) => f.file_path).filter(Boolean))];
      if (dryRun) {
        projectsPurged++;
        filesDeleted += keys.length;
        continue;
      }
      const results = await Promise.all(keys.map((key) => removeObject(store, key).catch(() => false)));
      filesDeleted += results.filter(Boolean).length;
      if (results.every(Boolean)) {
        // The deleted_at guard: a project restored a moment ago is left alone.
        const { error } = await admin.from("projects").delete().eq("id", project.id).lt("deleted_at", cutoff);
        if (error) {
          projectsHeld++;
          console.error("purge: could not delete project", project.id, error.message);
        } else {
          projectsPurged++;
        }
      } else {
        projectsHeld++;
        console.error("purge: some files would not delete, project kept for the next run", project.id);
      }
    }

    // ---- Pass 2: files under projects/ that nothing points at -----------------
    // Read the references first and let any failure abort: with an incomplete
    // list, live files would look like orphans.
    const referenced = new Set<string>([
      ...(await allValues(admin, "project_submissions", "file_path")),
      ...(await allValues(admin, "project_archive_entries", "file_path")),
    ]);
    const objects = await listProjectObjects(store);
    const now = Date.now();
    const orphans = objects.filter(
      (o) => !referenced.has(o.key) && Number.isFinite(o.lastModified) && now - o.lastModified > SWEEP_GRACE_MS,
    );

    let orphansDeleted = 0;
    if (!dryRun) {
      for (let i = 0; i < orphans.length; i += 20) {
        const batch = await Promise.all(orphans.slice(i, i + 20).map((o) => removeObject(store, o.key).catch(() => false)));
        orphansDeleted += batch.filter(Boolean).length;
      }
    }

    const summary = {
      dry_run: dryRun,
      projects_due: due?.length ?? 0,
      projects_purged: projectsPurged,
      projects_held_for_retry: projectsHeld,
      project_files_deleted: filesDeleted,
      files_in_projects_folder: objects.length,
      files_in_use: objects.filter((o) => referenced.has(o.key)).length,
      unreferenced_files_found: orphans.length,
      unreferenced_files_deleted: dryRun ? 0 : orphansDeleted,
    };
    console.log("project-purge", JSON.stringify(summary));
    return json(summary);
  } catch (error) {
    console.error("project-purge failed:", (error as Error).message);
    return json({ error: (error as Error).message }, 500);
  }
});
