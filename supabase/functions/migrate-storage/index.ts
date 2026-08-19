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

/**
 * Denormalised URL columns that sit alongside storage_path. The file itself is
 * already in R2 once storage_provider flips; these columns still hold the old
 * Supabase URL and are repointed by `relink`.
 */
const RELINK_COLUMNS = [
  { table: "payments", column: "payment_proof_url" },
  { table: "course_materials", column: "file_url" },
  { table: "assignment_submissions", column: "file_url" },
];

/**
 * Every column anywhere in the schema that can hold a link to a stored file.
 * The orphan audit treats a key mentioned by any of these as still in use, so
 * this list errs on the side of over-inclusion: a column listed here that turns
 * out to be irrelevant costs nothing, a missing one costs a live file.
 */
const URL_REF_COLUMNS = [
  { table: "profiles", column: "avatar_url", bucket: "avatars" },
  { table: "faculty_members", column: "photo_url", bucket: "avatars" },
  { table: "students", column: "profile_image_url", bucket: "avatars" },
  { table: "question_bank", column: "image_url", bucket: "question-images" },
  { table: "payments", column: "payment_proof_url", bucket: "submissions" },
  { table: "course_materials", column: "file_url", bucket: "course-materials" },
  { table: "assignment_submissions", column: "file_url", bucket: "assignments" },
];

/** Free-text/JSON settings rows that can embed an R2 link (logos, banners). */
const TEXT_REF_SOURCES = [
  { table: "app_settings", column: "value" },
  { table: "site_content", column: "content" },
  { table: "system_settings", column: "value" },
];

/**
 * An object younger than this is never reported or deleted as unused: its row
 * may still be in flight from an upload that has not committed yet.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

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

/** Pull the in-bucket object key out of an R2 public URL. */
function keyFromR2Url(url: string): string | null {
  if (!url.startsWith(`${R2_PUBLIC_BASE}/`)) return null;
  const raw = url.slice(R2_PUBLIC_BASE.length + 1).split("?")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** One stored file, in whichever of the two stores holds it. */
interface StoredObject {
  store: "r2" | "supabase";
  bucket: string;
  key: string;
  size: number;
  lastModified: string;
}

/** Every object in the bucket, straight from ListObjectsV2. */
async function listR2Objects(
  r2: ReturnType<typeof r2Client>,
): Promise<{ objects: StoredObject[]; truncated: boolean }> {
  const bucketName = Deno.env.get("R2_BUCKET_NAME") ?? "r2";
  const objects: StoredObject[] = [];
  let token: string | undefined;
  let pages = 0;

  do {
    const qs = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
    if (token) qs.set("continuation-token", token);

    const res = await r2.client.fetch(`${r2.bucketUrl}?${qs.toString()}`, { method: "GET" });
    if (!res.ok) throw new Error(`R2 list failed (${res.status}): ${await res.text()}`);

    const xml = await res.text();
    pages++;

    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const chunk = m[1];
      objects.push({
        store: "r2",
        bucket: bucketName,
        key: chunk.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "",
        size: Number(chunk.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
        lastModified: chunk.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "",
      });
    }

    const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = isTruncated
      ? xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]
      : undefined;
  } while (token && pages < 50);

  return { objects, truncated: !!token };
}

interface RefSets {
  /** Object keys still pointed at in R2. */
  r2: Set<string>;
  /** Still-referenced Supabase objects, as `bucket/key`. */
  supabase: Set<string>;
}

/** Bucket and key out of a Supabase storage URL, whichever bucket it names. */
function refFromSupabaseUrl(url: string): { bucket: string; key: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?"'\s]+)/);
  if (!m) return null;
  let key = m[2];
  try {
    key = decodeURIComponent(key);
  } catch { /* keep the raw form */ }
  return { bucket: m[1], key };
}

/**
 * Everything the database still points at, per store. An object outside these
 * sets is an orphan — left behind by a deleted record or a replaced upload.
 *
 * Both stores are collected from the same row: during a migration a file
 * legitimately exists in both places, and neither copy should read as unused.
 */
async function referencedKeys(admin: any): Promise<RefSets> {
  const r2 = new Set<string>();
  const sb = new Set<string>();

  const addR2 = (key: string | null | undefined) => {
    if (!key) return;
    r2.add(key);
    // Avatars were re-prefixed on migration; accept a row that still names the
    // pre-migration key so the prefixed object is not read as an orphan.
    if (!key.startsWith("avatars/")) r2.add(`avatars/${key}`);
  };

  const addSb = (bucket: string | null | undefined, key: string | null | undefined) => {
    if (!bucket || !key) return;
    sb.add(`${bucket}/${key}`);
    // The mirror of the above: an R2 key carries the prefix, its Supabase
    // original does not.
    if (key.startsWith("avatars/")) sb.add(`${bucket}/${key.slice("avatars/".length)}`);
  };

  for (const { table, bucket } of TRACKED) {
    const { data } = await admin.from(table).select("storage_path").not("storage_path", "is", null);
    for (const row of data ?? []) {
      const key = row.storage_path as string;
      addR2(key);
      addSb(bucket, key);
    }
  }

  for (const { table, column, bucket } of URL_REF_COLUMNS) {
    const { data } = await admin.from(table).select(column).not(column, "is", null);
    for (const row of (data ?? []) as any[]) {
      const value = row[column] as string;

      const r2Key = keyFromR2Url(value);
      if (r2Key) {
        addR2(r2Key);
        addSb(bucket, r2Key);
      }

      const sbRef = refFromSupabaseUrl(value);
      if (sbRef) {
        addSb(sbRef.bucket, sbRef.key);
        addR2(sbRef.key);
      }
    }
  }

  // Settings blobs: scoop up any storage link mentioned anywhere in the text.
  const escapedBase = R2_PUBLIC_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const r2Pattern = new RegExp(`${escapedBase}/[^\\s"'<>)]+`, "g");
  const sbPattern = /https?:\/\/[^\s"'<>)]*\/storage\/v1\/object\/[^\s"'<>)]+/g;

  for (const { table, column } of TEXT_REF_SOURCES) {
    const { data } = await admin.from(table).select(column);
    for (const row of (data ?? []) as any[]) {
      const value = row[column];
      const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
      for (const match of text.matchAll(r2Pattern)) addR2(keyFromR2Url(match[0]));
      for (const match of text.matchAll(sbPattern)) {
        const ref = refFromSupabaseUrl(match[0]);
        if (ref) addSb(ref.bucket, ref.key);
      }
    }
  }

  return { r2, supabase: sb };
}

/** Every object in every Supabase bucket, walked folder by folder. */
async function listSupabaseObjects(
  admin: any,
): Promise<{ objects: StoredObject[]; truncated: boolean }> {
  const objects: StoredObject[] = [];
  let truncated = false;

  const { data: buckets } = await admin.storage.listBuckets();

  for (const bucket of buckets ?? []) {
    const queue: string[] = [""];
    let folders = 0;

    while (queue.length && folders < 2000) {
      const prefix = queue.shift()!;
      folders++;
      let offset = 0;

      while (true) {
        const { data, error } = await admin.storage.from(bucket.name).list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error || !data?.length) break;

        for (const entry of data) {
          const key = prefix ? `${prefix}/${entry.name}` : entry.name;
          // A folder comes back with no id and no metadata.
          if (entry.id === null || entry.metadata == null) {
            queue.push(key);
          } else {
            objects.push({
              store: "supabase",
              bucket: bucket.name,
              key,
              size: Number(entry.metadata.size ?? 0),
              lastModified: entry.updated_at ?? entry.created_at ?? "",
            });
          }
        }

        if (data.length < 1000) break;
        offset += 1000;
      }
    }

    if (folders >= 2000) truncated = true;
  }

  return { objects, truncated };
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

      // Rows whose file is in R2 but whose legacy URL column still points at Supabase.
      let relinkPending = 0;
      for (const { table, column } of RELINK_COLUMNS) {
        const { data, error } = await admin
          .from(table)
          .select(column)
          .eq("storage_provider", "r2")
          .not("storage_path", "is", null);
        if (error) continue;
        relinkPending += (data ?? []).filter((r: any) => {
          const v = r[column] as string | null;
          return !!v && !v.startsWith(R2_PUBLIC_BASE);
        }).length;
      }

      const totalPending = Object.values(pending).reduce((a, b) => a + b, 0);
      const totalMigrated = Object.values(migrated).reduce((a, b) => a + b, 0);
      return json({ pending, migrated, totalPending, totalMigrated, relinkPending, publicBase: R2_PUBLIC_BASE });
    }

    // ---------------- AUDIT ----------------
    // Walks both stores and marks each object as still referenced by the
    // database or orphaned. Read-only — nothing is deleted here.
    if (action === "audit") {
      const refs = await referencedKeys(admin);

      let r2Error: string | null = null;
      let r2Files: StoredObject[] = [];
      let truncated = false;

      try {
        const listed = await listR2Objects(r2Client());
        r2Files = listed.objects;
        truncated = truncated || listed.truncated;
      } catch (e) {
        r2Error = e instanceof Error ? e.message : String(e);
      }

      const sbListed = await listSupabaseObjects(admin);
      truncated = truncated || sbListed.truncated;

      const now = Date.now();
      const blank = () => ({
        objects: 0,
        bytes: 0,
        usedCount: 0,
        usedBytes: 0,
        unusedCount: 0,
        unusedBytes: 0,
        recentCount: 0,
      });
      const stores = { r2: blank(), supabase: blank() };

      const files = [...r2Files, ...sbListed.objects].map((o) => {
        const used = o.store === "r2"
          ? refs.r2.has(o.key)
          : refs.supabase.has(`${o.bucket}/${o.key}`);

        const age = o.lastModified ? now - Date.parse(o.lastModified) : Number.POSITIVE_INFINITY;
        const recent = Number.isFinite(age) && age < ORPHAN_GRACE_MS;

        const tally = stores[o.store];
        tally.objects++;
        tally.bytes += o.size;
        if (used) { tally.usedCount++; tally.usedBytes += o.size; }
        else if (recent) { tally.recentCount++; }
        else { tally.unusedCount++; tally.unusedBytes += o.size; }

        return { ...o, used, recent };
      });

      // Largest first, so a truncated list still shows what is worth reclaiming.
      files.sort((a, b) => b.size - a.size);

      return json({
        stores,
        r2Error,
        truncated,
        graceMinutes: Math.round(ORPHAN_GRACE_MS / 60000),
        totalObjects: files.length,
        // Capped so a huge bucket cannot blow the response size.
        files: files.slice(0, 2000),
        fileLimit: 2000,
      });
    }

    // ---------------- DELETE UNUSED ----------------
    // Deletes the objects the caller picked, from either store, but re-derives
    // the reference set first: anything the database still points at is
    // refused, never deleted.
    if (action === "delete-unused") {
      const requested: Array<{ store?: string; bucket?: string; key?: string }> =
        Array.isArray(body.files)
          ? body.files
          // Older callers sent bare R2 keys.
          : Array.isArray(body.keys)
          ? body.keys.map((k: string) => ({ store: "r2", key: k }))
          : [];

      const targets = requested.filter(
        (f) => typeof f?.key === "string" && f.key && (f.store === "r2" || f.store === "supabase"),
      ) as Array<{ store: "r2" | "supabase"; bucket?: string; key: string }>;

      if (!targets.length) return json({ error: "No files selected" }, 400);
      if (targets.length > 200) return json({ error: "Delete at most 200 files at a time" }, 400);

      const refs = await referencedKeys(admin);
      const needsR2 = targets.some((t) => t.store === "r2");
      const r2 = needsR2 ? r2Client() : null;

      const deleted: string[] = [];
      const kept: Array<{ key: string; reason: string }> = [];

      for (const target of targets) {
        const label = target.store === "r2" ? target.key : `${target.bucket}/${target.key}`;

        if (target.store === "supabase" && !target.bucket) {
          kept.push({ key: label, reason: "no bucket given" });
          continue;
        }

        const referenced = target.store === "r2" ? refs.r2.has(target.key) : refs.supabase.has(label);
        if (referenced) {
          kept.push({ key: label, reason: "still referenced by a record" });
          continue;
        }

        if (target.store === "r2") {
          const head = await r2!.client.fetch(`${r2!.bucketUrl}/${encodeKey(target.key)}`, { method: "HEAD" });
          const modified = head.headers.get("last-modified");
          if (head.ok && modified && Date.now() - Date.parse(modified) < ORPHAN_GRACE_MS) {
            kept.push({ key: label, reason: "uploaded too recently" });
            continue;
          }

          const res = await r2!.client.fetch(`${r2!.bucketUrl}/${encodeKey(target.key)}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) {
            kept.push({ key: label, reason: `R2 refused the delete (${res.status})` });
            continue;
          }
          deleted.push(label);
          continue;
        }

        // Supabase: re-read the object's own listing row for its timestamp.
        const at = target.key.lastIndexOf("/");
        const folder = at === -1 ? "" : target.key.slice(0, at);
        const name = at === -1 ? target.key : target.key.slice(at + 1);
        const { data: found } = await admin.storage.from(target.bucket!).list(folder, { limit: 100, search: name });
        const entry = (found ?? []).find((e: any) => e.name === name);
        const stamp = entry?.updated_at ?? entry?.created_at;
        if (stamp && Date.now() - Date.parse(stamp) < ORPHAN_GRACE_MS) {
          kept.push({ key: label, reason: "uploaded too recently" });
          continue;
        }

        const { error: rmErr } = await admin.storage.from(target.bucket!).remove([target.key]);
        if (rmErr) kept.push({ key: label, reason: rmErr.message });
        else deleted.push(label);
      }

      return json({ deleted: deleted.length, kept: kept.length, keptDetail: kept.slice(0, 20) });
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

    // ---------------- RELINK ----------------
    // Repoints the legacy URL columns at R2 for rows already migrated. Pages that
    // read these columns directly would otherwise still be served from Supabase.
    if (action === "relink") {
      const r2 = r2Client();
      let updated = 0;
      const skipped: Array<{ ref: string; reason: string }> = [];

      for (const { table, column } of RELINK_COLUMNS) {
        const { data, error } = await admin
          .from(table)
          .select(`id, storage_path, ${column}`)
          .eq("storage_provider", "r2")
          .not("storage_path", "is", null);
        if (error || !data?.length) continue;

        for (const row of data as any[]) {
          const key = row.storage_path as string;
          const current = row[column] as string | null;
          const target = `${R2_PUBLIC_BASE}/${encodeKey(key)}`;
          if (current === target) continue;

          if (!(await existsInR2(r2, key))) {
            skipped.push({ ref: `${table}:${row.id}`, reason: "object not found in R2" });
            continue;
          }
          const { error: upErr } = await admin.from(table).update({ [column]: target }).eq("id", row.id);
          if (upErr) skipped.push({ ref: `${table}:${row.id}`, reason: upErr.message });
          else updated++;
        }
      }

      return json({ updated, skipped: skipped.length, skippedDetail: skipped.slice(0, 20) });
    }

    // ---------------- CLEANUP ----------------
    // Deletes Supabase originals, but only for objects re-verified in R2.
    if (action === "cleanup") {
      const r2 = r2Client();

      // Refuse while any legacy URL column still points at Supabase — deleting
      // the originals would break every page that reads those columns.
      for (const { table, column } of RELINK_COLUMNS) {
        const { data } = await admin
          .from(table)
          .select(column)
          .eq("storage_provider", "r2")
          .not("storage_path", "is", null);
        const stale = (data ?? []).filter((r: any) => {
          const v = r[column] as string | null;
          return !!v && !v.startsWith(R2_PUBLIC_BASE);
        }).length;
        if (stale > 0) {
          return json(
            { error: `${stale} ${table}.${column} value(s) still point at Supabase. Run the relink step before cleanup.` },
            409,
          );
        }
      }

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
