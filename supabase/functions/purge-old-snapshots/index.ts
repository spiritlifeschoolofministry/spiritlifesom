// Auto-purges proctor snapshots older than RETENTION_DAYS (default: 30).
// Designed to be called by pg_cron — public endpoint, optionally guarded by PURGE_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-purge-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const encodeKey = (p: string) => p.split("/").map(encodeURIComponent).join("/");

function r2Client() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET_NAME");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    bucketUrl: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  };
}

/**
 * Delete proctoring images that no longer belong to anything.
 *
 * exam_snapshots.attempt_id cascades, so deleting an attempt — a staff
 * rehearsal, a re-sit granted after a failure — takes the rows with it and
 * leaves the images in the bucket with nothing pointing at them. Age alone
 * would never catch those: the row that recorded their age is gone.
 *
 * Only files past the retention cutoff are considered, so an upload racing an
 * in-flight insert is never mistaken for an orphan.
 */
// deno-lint-ignore no-explicit-any
async function sweepOrphans(supabase: any, cutoff: string): Promise<number> {
  const r2 = r2Client();
  if (!r2) return 0;

  const { data: known, error } = await supabase
    .from("exam_snapshots")
    .select("storage_path")
    .eq("storage_provider", "r2");
  if (error) {
    console.error("Orphan sweep: could not read known paths, skipping:", error);
    return 0;
  }
  const referenced = new Set((known ?? []).map((s: any) => s.storage_path));

  let removed = 0;
  let token: string | undefined;
  const cutoffMs = new Date(cutoff).getTime();

  do {
    const url = new URL(r2.bucketUrl + "/");
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", "proctoring/");
    url.searchParams.set("max-keys", "1000");
    if (token) url.searchParams.set("continuation-token", token);

    const res = await r2.client.fetch(url.toString());
    if (!res.ok) {
      console.error("Orphan sweep: list failed", res.status, await res.text());
      return removed;
    }
    const xml = await res.text();

    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    const dates = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)].map((m) => m[1]);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (referenced.has(key)) continue;
      const modified = dates[i] ? new Date(dates[i]).getTime() : 0;
      if (!modified || modified >= cutoffMs) continue;

      const del = await r2.client.fetch(`${r2.bucketUrl}/${encodeKey(key)}`, { method: "DELETE" });
      if (del.ok || del.status === 404) removed++;
      else console.error("Orphan sweep: delete failed", key, del.status);
    }

    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = truncated
      ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
      : undefined;
  } while (token);

  return removed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Optional shared-secret guard for cron callers
    const expectedSecret = Deno.env.get("PURGE_SECRET");
    if (expectedSecret) {
      const provided = req.headers.get("x-purge-secret");
      if (provided !== expectedSecret) return json({ error: "Forbidden" }, 403);
    }

    const RETENTION_DAYS = Number(Deno.env.get("SNAPSHOT_RETENTION_DAYS") || 30);
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch snapshots older than cutoff
    const { data: fetched, error: fetchErr } = await supabase
      .from("exam_snapshots")
      .select("id, storage_path, storage_provider")
      .lt("captured_at", cutoff)
      .limit(1000);

    if (fetchErr) throw fetchErr;
    let oldSnaps = fetched;
    if (!oldSnaps || oldSnaps.length === 0) {
      // Still sweep: orphaned files outlive the rows that dated them.
      const orphansOnly = await sweepOrphans(supabase, cutoff);
      return json({ purged: 0, orphan_files_removed: orphansOnly, cutoff, message: "Nothing to purge" });
    }

    // Snapshots live in one of two places, and the row says which. Deleting
    // only from Supabase Storage left every R2 object behind — the database
    // row went, so the file could no longer even be found, let alone removed.
    const r2Paths = oldSnaps
      .filter((s: any) => s.storage_provider === "r2")
      .map((s: any) => s.storage_path)
      .filter(Boolean);
    const supabasePaths = oldSnaps
      .filter((s: any) => s.storage_provider !== "r2")
      .map((s: any) => s.storage_path)
      .filter(Boolean);

    let storageDeleted = 0;
    if (supabasePaths.length > 0) {
      // Storage delete supports up to ~1000 paths per call
      const { data: removed, error: removeErr } = await supabase
        .storage.from("proctor-snapshots").remove(supabasePaths);
      if (removeErr) console.error("storage.remove error:", removeErr);
      storageDeleted = removed?.length ?? 0;
    }

    let r2Deleted = 0;
    const r2Failures: string[] = [];
    if (r2Paths.length > 0) {
      const r2 = r2Client();
      if (!r2) {
        throw new Error("R2 is not configured; refusing to drop rows whose files cannot be deleted");
      }

      for (const path of r2Paths) {
        const res = await r2.client.fetch(`${r2.bucketUrl}/${encodeKey(path)}`, { method: "DELETE" });
        // R2 answers 204 for a delete and for a key that was never there.
        if (res.ok || res.status === 404) r2Deleted++;
        else r2Failures.push(path);
      }
    }

    // Only forget the rows whose files are actually gone. Dropping a row for a
    // file still sitting in the bucket would orphan it permanently.
    if (r2Failures.length) {
      console.error("R2 delete failures:", r2Failures);
      const failed = new Set(r2Failures);
      oldSnaps = oldSnaps.filter((s: any) => !failed.has(s.storage_path));
    }

    const ids = oldSnaps.map((s: any) => s.id);
    if (ids.length > 0) {
      const { error: dbErr } = await supabase.from("exam_snapshots").delete().in("id", ids);
      if (dbErr) throw dbErr;
    }

    const orphansRemoved = await sweepOrphans(supabase, cutoff);

    return json({
      purged: ids.length,
      storage_files_removed: storageDeleted,
      r2_files_removed: r2Deleted,
      r2_failures: r2Failures.length,
      orphan_files_removed: orphansRemoved,
      cutoff,
      retention_days: RETENTION_DAYS,
    });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
