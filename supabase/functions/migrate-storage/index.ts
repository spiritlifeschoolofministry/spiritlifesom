import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Moves files from Supabase Storage into Cloudflare R2, server-side.
 *
 * Migration never deletes the Supabase original — `cleanup` does that as a
 * separate, explicit step, and only after re-checking the object exists in R2.
 *
 * Work is processed in batches so a large backlog cannot hit the request
 * timeout; the caller keeps invoking until `remaining` reaches zero.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const R2_PUBLIC_BASE = (Deno.env.get("R2_PUBLIC_URL") ?? "https://media.spiritlifesom.org").replace(/\/+$/, "");
const DEFAULT_BATCH = 20;

/** Tables whose files are tracked by storage_path + storage_provider. */
const TRACKED = [
  { table: "payments", bucket: "submissions" },
  { table: "course_materials", bucket: "course-materials" },
  { table: "assignment_submissions", bucket: "assignments" },
  { table: "exam_snapshots", bucket: "proctor-snapshots" },
];

/** Columns holding a raw public Supabase URL that must be rewritten in place. */
const URL_COLUMNS = [
  { table: "profiles", column: "avatar_url", bucket: "avatars" },
  { table: "faculty_members", column: "photo_url", bucket: "avatars" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function encodeKey(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function r2Client() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET_NAME");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 is not fully configured");
  }

  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    bucketUrl: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  };
}

/** Pull the in-bucket object key out of a Supabase public/sign URL. */
function keyFromSupabaseUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  for (const m of [marker, signMarker]) {
    const at = url.indexOf(m);
    if (at !== -1) {
      const raw = url.slice(at + m.length).split("?")[0];
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/** Where a Supabase object lands in R2. Avatars keep an avatars/ prefix. */
function targetKey(bucket: string, key: string): string {
  if (bucket === "avatars") return key.startsWith("avatars/") ? key : `avatars/${key}`;
  return key;
}

async function existsInR2(r2: ReturnType<typeof r2Client>, key: string): Promise<boolean> {
  const res = await r2.client.fetch(`${r2.bucketUrl}/${encodeKey(key)}`, { method: "HEAD" });
  return res.ok;
}

async function copyToR2(
  admin: any,
  r2: ReturnType<typeof r2Client>,
  bucket: string,
  key: string,
  destKey: string,
): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).download(key);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? "no body"}`);

  const res = await r2.client.fetch(`${r2.bucketUrl}/${encodeKey(destKey)}`, {
    method: "PUT",
    body: await data.arrayBuffer(),
    headers: { "content-type": data.type || "application/octet-stream" },
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: `Method ${req.method} not allowed` }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await caller.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ error: "Only admins may migrate storage" }, 403);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "scan";
    const batchSize = Math.min(Number(body.limit) || DEFAULT_BATCH, 100);

    // ---------------- SCAN ----------------
    if (action === "scan") {
      const pending: Record<string, number> = {};
      const migrated: Record<string, number> = {};

      for (const { table } of TRACKED) {
        const { data, error } = await admin
          .from(table)
          .select("storage_provider")
          .not("storage_path", "is", null);
        if (error) continue;
        pending[table] = (data ?? []).filter((r: any) => r.storage_provider !== "r2").length;
        migrated[table] = (data ?? []).filter((r: any) => r.storage_provider === "r2").length;
      }

      for (const { table, column } of URL_COLUMNS) {
        const { data, error } = await admin.from(table).select(column).not(column, "is", null);
        if (error) continue;
        const urls = (data ?? []).map((r: any) => r[column] as string);
        pending[`${table}.${column}`] = urls.filter((u) => u.includes("/storage/v1/object/")).length;
        migrated[`${table}.${column}`] = urls.filter((u) => u.startsWith(R2_PUBLIC_BASE)).length;
      }

      const totalPending = Object.values(pending).reduce((a, b) => a + b, 0);
      const totalMigrated = Object.values(migrated).reduce((a, b) => a + b, 0);
      return json({ pending, migrated, totalPending, totalMigrated, publicBase: R2_PUBLIC_BASE });
    }

    // ---------------- MIGRATE ----------------
    if (action === "migrate") {
      const r2 = r2Client();
      const results: Array<{ ref: string; ok: boolean; error?: string; skipped?: boolean }> = [];
      let processed = 0;

      // Tracked tables first.
      for (const { table, bucket } of TRACKED) {
        if (processed >= batchSize) break;
        const { data, error } = await admin
          .from(table)
          .select("id, storage_path, storage_provider")
          .not("storage_path", "is", null)
          .neq("storage_provider", "r2")
          .limit(batchSize - processed);
        if (error || !data?.length) continue;

        for (const row of data) {
          processed++;
          const key = row.storage_path as string;
          const dest = targetKey(bucket, key);
          try {
            if (!(await existsInR2(r2, dest))) {
              await copyToR2(admin, r2, bucket, key, dest);
            }
            const { error: upErr } = await admin
              .from(table)
              .update({ storage_provider: "r2", storage_path: dest })
              .eq("id", row.id);
            if (upErr) throw new Error(upErr.message);
            results.push({ ref: `${table}:${row.id}`, ok: true });
          } catch (e) {
            results.push({ ref: `${table}:${row.id}`, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      // Then URL-embedded columns (avatars, faculty photos).
      for (const { table, column, bucket } of URL_COLUMNS) {
        if (processed >= batchSize) break;
        const { data, error } = await admin
          .from(table)
          .select(`id, ${column}`)
          .not(column, "is", null)
          .like(column, "%/storage/v1/object/%")
          .limit(batchSize - processed);
        if (error || !data?.length) continue;

        for (const row of data as any[]) {
          processed++;
          const url = row[column] as string;
          const key = keyFromSupabaseUrl(url, bucket);
          if (!key) {
            results.push({ ref: `${table}.${column}:${row.id}`, ok: false, error: "unrecognised URL shape" });
            continue;
          }
          const dest = targetKey(bucket, key);
          try {
            if (!(await existsInR2(r2, dest))) {
              await copyToR2(admin, r2, bucket, key, dest);
            }
            const { error: upErr } = await admin
              .from(table)
              .update({ [column]: `${R2_PUBLIC_BASE}/${encodeKey(dest)}` })
              .eq("id", row.id);
            if (upErr) throw new Error(upErr.message);
            results.push({ ref: `${table}.${column}:${row.id}`, ok: true });
          } catch (e) {
            results.push({ ref: `${table}.${column}:${row.id}`, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      const succeeded = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      return json({
        processed,
        succeeded,
        failed: failed.length,
        failures: failed.slice(0, 20),
        done: processed === 0,
      });
    }

    // ---------------- CLEANUP ----------------
    // Deletes Supabase originals, but only for objects re-verified in R2.
    if (action === "cleanup") {
      const r2 = r2Client();
      const deleted: string[] = [];
      const kept: Array<{ ref: string; reason: string }> = [];
      let processed = 0;

      for (const { table, bucket } of TRACKED) {
        if (processed >= batchSize) break;
        const { data, error } = await admin
          .from(table)
          .select("id, storage_path")
          .eq("storage_provider", "r2")
          .not("storage_path", "is", null)
          .limit(batchSize - processed);
        if (error || !data?.length) continue;

        for (const row of data) {
          processed++;
          const key = row.storage_path as string;
          if (!(await existsInR2(r2, key))) {
            kept.push({ ref: `${table}:${row.id}`, reason: "not confirmed in R2" });
            continue;
          }
          const { error: rmErr } = await admin.storage.from(bucket).remove([key]);
          if (rmErr) kept.push({ ref: `${table}:${row.id}`, reason: rmErr.message });
          else deleted.push(`${bucket}/${key}`);
        }
      }

      return json({ processed, deleted: deleted.length, kept: kept.length, keptDetail: kept.slice(0, 20) });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("migrate-storage error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
