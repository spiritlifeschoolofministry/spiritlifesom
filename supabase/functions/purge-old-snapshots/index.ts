// Auto-purges proctor snapshots older than RETENTION_DAYS (default: 30).
// Designed to be called by pg_cron — public endpoint, optionally guarded by PURGE_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-purge-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    const { data: oldSnaps, error: fetchErr } = await supabase
      .from("exam_snapshots")
      .select("id, storage_path")
      .lt("captured_at", cutoff)
      .limit(1000);

    if (fetchErr) throw fetchErr;
    if (!oldSnaps || oldSnaps.length === 0) {
      return json({ purged: 0, cutoff, message: "Nothing to purge" });
    }

    const paths = oldSnaps.map((s: any) => s.storage_path).filter(Boolean);
    let storageDeleted = 0;
    if (paths.length > 0) {
      // Storage delete supports up to ~1000 paths per call
      const { data: removed, error: removeErr } = await supabase
        .storage.from("proctor-snapshots").remove(paths);
      if (removeErr) console.error("storage.remove error:", removeErr);
      storageDeleted = removed?.length ?? 0;
    }

    const ids = oldSnaps.map((s: any) => s.id);
    const { error: dbErr } = await supabase.from("exam_snapshots").delete().in("id", ids);
    if (dbErr) throw dbErr;

    return json({
      purged: ids.length,
      storage_files_removed: storageDeleted,
      cutoff,
      retention_days: RETENTION_DAYS,
    });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
