// seo-files — serves robots.txt, sitemap.xml, llms.txt, ai.txt and
// security.txt from the seo_files table so an admin can edit them without a
// redeploy. The host rewrites those public paths onto this function.
//
// Crawlers read these. A 5xx on robots.txt is read by some crawlers as
// "disallow everything", so this function never fails: if the database is
// unreachable it answers with the shipped fallback below.
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const BY_PATH: Record<string, string> = {
  "/robots.txt": "robots",
  "/sitemap.xml": "sitemap",
  "/llms.txt": "llms",
  "/ai.txt": "ai",
  "/security.txt": "security",
  "/.well-known/security.txt": "security",
};

const CONTENT_TYPES: Record<string, string> = {
  sitemap: "application/xml; charset=utf-8",
};

// Minimal last-resort bodies. Deliberately permissive so a database outage
// never turns into an accidental de-indexing.
const FALLBACK: Record<string, string> = {
  robots: `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /student/\n\nSitemap: https://spiritlifesom.org/sitemap.xml\n`,
  sitemap: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://spiritlifesom.org/</loc></url>\n</urlset>\n`,
  llms: `# Spirit Life School of Ministry\n\n> Ministry training school in Ibadan, Nigeria.\n\nSee https://spiritlifesom.org\n`,
  ai: `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /student/\n`,
  security: `Contact: mailto:spiritlifeschoolofministry@gmail.com\nPreferred-Languages: en\nCanonical: https://spiritlifesom.org/.well-known/security.txt\n`,
};

const send = (slug: string, body: string, cached: boolean) =>
  new Response(body, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[slug] ?? "text/plain; charset=utf-8",
      // Short enough that an edit shows up quickly, long enough that crawlers
      // are not re-reading the database on every hit.
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex",
      "Access-Control-Allow-Origin": "*",
      "X-Seo-Source": cached ? "fallback" : "database",
    },
  });

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // The function may be reached either through the host rewrite (which keeps
  // the original path) or directly as /functions/v1/seo-files?file=robots.
  const requested = url.searchParams.get("file");
  const pathKey = url.pathname.replace(/^\/functions\/v1\/seo-files/, "") || "/";
  const slug = requested ?? BY_PATH[pathKey] ?? BY_PATH[`/${pathKey.split("/").pop()}`];

  if (!slug || !(slug in FALLBACK)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabase
      .from("seo_files")
      .select("content, content_type, is_published")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.is_published || !data.content?.trim()) {
      return send(slug, FALLBACK[slug], true);
    }

    return new Response(data.content, {
      status: 200,
      headers: {
        "Content-Type": data.content_type || CONTENT_TYPES[slug] || "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Robots-Tag": "noindex",
        "Access-Control-Allow-Origin": "*",
        "X-Seo-Source": "database",
      },
    });
  } catch (err) {
    console.error("seo-files: falling back for", slug, err);
    return send(slug, FALLBACK[slug], true);
  }
});
