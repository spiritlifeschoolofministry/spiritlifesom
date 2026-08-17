import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Cloudflare R2 storage gateway.
 *
 * Signs S3-compatible requests with aws4fetch (Web Crypto only). The AWS SDK is
 * deliberately avoided here: esm.sh resolves it with `aws-crt`, a native Node
 * addon that the edge runtime cannot load, which crashed this function at boot.
 *
 * All requests are POST. An upload arrives as multipart/form-data; everything
 * else as JSON `{ action, path }`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DELETE_ROLES = ["admin", "teacher"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Percent-encode each segment but keep the slashes that give R2 its folders. */
function encodeKey(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function r2Config() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET_NAME");

  const missing = [
    ["R2_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["R2_BUCKET_NAME", bucket],
  ].filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    throw new Error(`R2 is not configured: missing ${missing.join(", ")}`);
  }

  const client = new AwsClient({
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    service: "s3",
    region: "auto",
  });

  return {
    client,
    bucketUrl: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
    bucket: bucket!,
  };
}

/** Resolve the caller from their JWT, and their profile role for authorization. */
async function getCaller(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { user: null, role: null };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return { user, role: profile?.role ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: `Method ${req.method} not allowed` }, 405);
  }

  try {
    const { user, role } = await getCaller(req);
    if (!user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const { client, bucketUrl, bucket } = r2Config();
    const contentType = req.headers.get("content-type") ?? "";

    // --- UPLOAD (multipart) ---
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const path = formData.get("path");

      if (!(file instanceof File) || typeof path !== "string" || !path) {
        return json({ error: "Missing file or path" }, 400);
      }

      const res = await client.fetch(`${bucketUrl}/${encodeKey(path)}`, {
        method: "PUT",
        body: await file.arrayBuffer(),
        headers: { "content-type": file.type || "application/octet-stream" },
      });

      if (!res.ok) {
        return json({ error: `R2 rejected the upload (${res.status}): ${await res.text()}` }, 502);
      }

      return json({ success: true, path });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const path = body.path;

    // --- TRUE INVENTORY ---
    // Walks the whole bucket with ListObjectsV2. The Cloudflare dashboard's
    // object/size columns are lagging telemetry, so this is the live figure.
    if (action === "list") {
      const prefix: string = typeof body.prefix === "string" ? body.prefix : "";
      const wantKeys = body.includeKeys === true;

      let token: string | undefined;
      let objects = 0;
      let bytes = 0;
      const byPrefix: Record<string, { objects: number; bytes: number }> = {};
      const keys: Array<{ key: string; size: number }> = [];
      let pages = 0;

      do {
        const qs = new URLSearchParams({ "list-type": "2", "max-keys": "1000" });
        if (prefix) qs.set("prefix", prefix);
        if (token) qs.set("continuation-token", token);

        const res = await client.fetch(`${bucketUrl}?${qs.toString()}`, { method: "GET" });
        if (!res.ok) {
          return json({ error: `R2 list failed (${res.status}): ${await res.text()}` }, 502);
        }
        const xml = await res.text();
        pages++;

        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const chunk = m[1];
          const key = chunk.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "";
          const size = Number(chunk.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
          objects++;
          bytes += size;

          // Group by first path segment so the UI can show a breakdown.
          const top = key.includes("/") ? key.split("/")[0] : "(root)";
          const bucketRow = byPrefix[top] ?? { objects: 0, bytes: 0 };
          bucketRow.objects++;
          bucketRow.bytes += size;
          byPrefix[top] = bucketRow;

          if (wantKeys && keys.length < 2000) keys.push({ key, size });
        }

        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        token = truncated
          ? xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]
          : undefined;
      } while (token && pages < 100);

      return json({ bucket, objects, bytes, byPrefix, pages, ...(wantKeys ? { keys } : {}) });
    }

    // --- CONNECTIVITY CHECK ---
    // Lists a single key to prove the credentials and bucket actually work.
    if (action === "ping") {
      const res = await client.fetch(`${bucketUrl}?list-type=2&max-keys=1`, { method: "GET" });
      if (!res.ok) {
        return json({ ok: false, bucket, status: res.status, detail: await res.text() }, 502);
      }
      return json({ ok: true, bucket });
    }

    // --- SIGNED DOWNLOAD URL ---
    if (action === "download") {
      if (!path) return json({ error: "Missing path" }, 400);

      const signed = await client.sign(
        `${bucketUrl}/${encodeKey(path)}?X-Amz-Expires=3600`,
        { method: "GET", aws: { signQuery: true } },
      );

      return json({ url: signed.url });
    }

    // --- DELETE ---
    if (action === "delete") {
      if (!path) return json({ error: "Missing path" }, 400);
      if (!role || !DELETE_ROLES.includes(role)) {
        return json({ error: "Only staff may delete files" }, 403);
      }

      const res = await client.fetch(`${bucketUrl}/${encodeKey(path)}`, { method: "DELETE" });

      // R2 returns 204 for a delete, and also for a key that was never there.
      if (!res.ok && res.status !== 404) {
        return json({ error: `R2 rejected the delete (${res.status}): ${await res.text()}` }, 502);
      }

      return json({ success: true, path });
    }

    return json({ error: `Unknown action: ${action ?? "(none)"}` }, 400);
  } catch (error) {
    console.error("R2 error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
