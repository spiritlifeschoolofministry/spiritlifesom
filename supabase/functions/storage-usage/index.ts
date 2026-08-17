// storage-usage v2 — auto-detects Supabase plan via Management API
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_LIMITS: Record<string, number> = {
  free: 1 * 1024 ** 3,
  pro: 100 * 1024 ** 3,
  team: 100 * 1024 ** 3,
  enterprise: 1024 * 1024 ** 3,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
    const role = (profile?.role || "").toLowerCase();
    if (!["admin", "teacher"].includes(role)) return json({ error: "Forbidden" }, 403);

    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) throw bErr;

    const perBucket: Array<{ name: string; bytes: number; files: number }> = [];

    const walk = async (bucket: string, prefix = ""): Promise<{ bytes: number; files: number }> => {
      let bytes = 0, files = 0, offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
        if (error || !data || data.length === 0) break;
        for (const item of data) {
          if (item.id === null || item.metadata == null) {
            const sub = await walk(bucket, prefix ? `${prefix}/${item.name}` : item.name);
            bytes += sub.bytes; files += sub.files;
          } else {
            bytes += Number(item.metadata.size ?? 0);
            files += 1;
          }
        }
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      return { bytes, files };
    };

    let totalBytes = 0, totalFiles = 0;
    for (const b of buckets ?? []) {
      const stats = await walk(b.name);
      perBucket.push({ name: b.name, bytes: stats.bytes, files: stats.files });
      totalBytes += stats.bytes;
      totalFiles += stats.files;
    }

    let limitBytes = Number(Deno.env.get("STORAGE_LIMIT_BYTES") || 0);
    let planName: string | null = null;
    let limitSource = "default";

    if (limitBytes > 0) {
      limitSource = "manual_override";
    } else {
      const planEnv = (Deno.env.get("SUPABASE_PLAN") || "").toLowerCase().trim();
      if (planEnv && PLAN_LIMITS[planEnv]) {
        planName = planEnv;
        limitBytes = PLAN_LIMITS[planEnv];
        limitSource = "plan_env";
      }
    }

    if (!limitBytes) {
      const pat = Deno.env.get("SB_MGMT_ACCESS_TOKEN") || Deno.env.get("SUPABASE_ACCESS_TOKEN");
      const projectRef = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
      if (pat && projectRef) {
        try {
          const orgRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
            headers: { Authorization: `Bearer ${pat}` },
          });
          if (orgRes.ok) {
            const proj = await orgRes.json();
            const orgId = proj.organization_id;
            if (orgId) {
              const subRes = await fetch(`https://api.supabase.com/v1/organizations/${orgId}/billing/subscription`, {
                headers: { Authorization: `Bearer ${pat}` },
              });
              if (subRes.ok) {
                const sub = await subRes.json();
                const tier = (sub?.tier?.name || sub?.plan?.id || "").toString().toLowerCase();
                if (PLAN_LIMITS[tier]) {
                  planName = tier;
                  limitBytes = PLAN_LIMITS[tier];
                  limitSource = "management_api";
                }
              }
            }
          }
        } catch (_) { /* fall through */ }
      }
    }

    if (!limitBytes) {
      planName = "free";
      limitBytes = PLAN_LIMITS.free;
      limitSource = "fallback_free";
    }

    return json({
      total_bytes: totalBytes,
      total_files: totalFiles,
      limit_bytes: limitBytes,
      plan: planName,
      limit_source: limitSource,
      percent_used: limitBytes > 0 ? (totalBytes / limitBytes) * 100 : 0,
      buckets: perBucket.sort((a, b) => b.bytes - a.bytes),
    });
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
