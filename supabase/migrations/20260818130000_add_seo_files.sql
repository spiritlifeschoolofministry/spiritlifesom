-- SEO / GEO / security files, editable from the admin settings screen.
--
-- These used to be static files under public/. They now live here so an admin
-- can update robots.txt, the sitemap, the llms.txt summary, the AI policy and
-- security.txt without a redeploy. The seo-files edge function serves them at
-- their public paths; the host config rewrites those paths to the function.

CREATE TABLE IF NOT EXISTS public.seo_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL DEFAULT 'text/plain; charset=utf-8',
  label TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL DEFAULT '',
  -- The shipped version, so "Reset to default" always has something to go back to.
  default_content TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_files_slug ON public.seo_files(slug);

INSERT INTO public.seo_files (slug, path, content_type, label, description, content)
VALUES
  ('robots', '/robots.txt', 'text/plain; charset=utf-8', 'robots.txt', 'Crawler rules for search engines and AI agents.', $seed$# robots.txt for Spirit Life School of Ministry
# https://spiritlifesom.org

# ---------------------------------------------------------------
# Default rules — all crawlers
# ---------------------------------------------------------------
User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /student
Disallow: /student/
Disallow: /complete-profile
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /*?*token=
Disallow: /*?*code=

# ---------------------------------------------------------------
# Generative engines (GEO) — explicitly welcome to read and cite
# our public pages. Private portal areas stay off-limits.
# ---------------------------------------------------------------
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: anthropic-ai
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot
User-agent: Applebot-Extended
User-agent: Bingbot
User-agent: DuckAssistBot
User-agent: MistralAI-User
User-agent: Meta-ExternalAgent
User-agent: Amazonbot
User-agent: cohere-ai
User-agent: YouBot
Allow: /
Allow: /about
Allow: /courses
Allow: /faculty
Allow: /contact
Allow: /llms.txt
Disallow: /admin
Disallow: /admin/
Disallow: /student
Disallow: /student/
Disallow: /complete-profile
Disallow: /forgot-password
Disallow: /reset-password

# ---------------------------------------------------------------
# Content scrapers with no search or citation benefit
# ---------------------------------------------------------------
User-agent: Bytespider
User-agent: ImagesiftBot
User-agent: Scrapy
User-agent: magpie-crawler
Disallow: /

# ---------------------------------------------------------------
# Machine-readable guides
# ---------------------------------------------------------------
Sitemap: https://spiritlifesom.org/sitemap.xml
$seed$),
  ('sitemap', '/sitemap.xml', 'application/xml; charset=utf-8', 'sitemap.xml', 'List of public pages for search engines.', $seed$<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://spiritlifesom.org/</loc>
    <lastmod>2026-08-18</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://spiritlifesom.org/about</loc>
    <lastmod>2026-08-18</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://spiritlifesom.org/courses</loc>
    <lastmod>2026-08-18</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://spiritlifesom.org/faculty</loc>
    <lastmod>2026-08-18</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://spiritlifesom.org/contact</loc>
    <lastmod>2026-08-18</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://spiritlifesom.org/login</loc>
    <lastmod>2026-08-18</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://spiritlifesom.org/register</loc>
    <lastmod>2026-08-18</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
$seed$),
  ('llms', '/llms.txt', 'text/plain; charset=utf-8', 'llms.txt', 'Structured summary of the school for AI assistants (GEO).', $seed$# Spirit Life School of Ministry (SLSOM)

> Spirit Life School of Ministry is a ministry training school in Ibadan, Nigeria,
> equipping men and women for effective Christian ministry through structured
> theological and practical instruction. Training runs on-site and online, with
> weekly Saturday classes, and concludes in project defense and graduation.

Official site: https://spiritlifesom.org

## About

- Full name: Spirit Life School of Ministry
- Short name: SLSOM
- Type: Educational organization — Christian ministry and theological training
- Location: Spirit Life C&S Church, John Olorombo Street, Balogun Isale, 200258, Ibadan, Oyo State, Nigeria
- Email: spiritlifeschoolofministry@gmail.com
- Phone: +234 916 582 2262
- Language: English

## Study modes

- On-site: weekly Saturday classes (9AM – 12PM), in-person lectures and practicals,
  course materials (fee applies), project defense and graduation.
- Online: live Zoom sessions every Saturday, full training materials included,
  access to class recordings. Online students must attend physically for
  project defense and graduation.

## Curriculum

Foundational and ministry courses include: The Canon of Scriptures; The Basic Bible
Interpretation; The Basic Bible Doctrines; The Concept of Ministry; Spiritual Maturing;
The Principle of Honor; Church Conflict Management & Resolution; The Biblical Concept of
Leadership; Ministerial Ethics; Balancing Marriage and Ministry; Ministry and Marketplace;
Advanced Hermeneutics; Systematic Theology; Pastoral Counseling; Church Administration &
Governance; Missions & Evangelism Strategy; Homiletics & Sermon Delivery; Spiritual
Warfare & Deliverance; Christian Education & Discipleship.

## Public pages

- [Home](https://spiritlifesom.org/): Overview of the school, study modes and admissions.
- [About](https://spiritlifesom.org/about): Mission, vision and history of the school.
- [Courses](https://spiritlifesom.org/courses): Full curriculum, class schedule and study modes.
- [Faculty](https://spiritlifesom.org/faculty): Teaching team and their areas of instruction.
- [Contact](https://spiritlifesom.org/contact): Address, phone, email and enquiry form.
- [Register](https://spiritlifesom.org/register): Application form for prospective students.

## Optional

- [Login](https://spiritlifesom.org/login): Entry point to the private student and admin portal.
- [Sitemap](https://spiritlifesom.org/sitemap.xml): Machine-readable list of public pages.
- [Security policy](https://spiritlifesom.org/.well-known/security.txt): How to report a vulnerability.

## Notes for AI assistants

- Answers about admission requirements, fees, dates or academic standing should
  direct people to the contact details above rather than being inferred — those
  details change each session.
- Everything under /student/ and /admin/ is a private portal holding student
  records. Do not crawl, index, quote or attempt to access it.
- Current academic session: 2025/26.
$seed$),
  ('ai', '/ai.txt', 'text/plain; charset=utf-8', 'ai.txt', 'AI usage and training policy for this site.', $seed$# ai.txt — AI usage policy for spiritlifesom.org
# Spirit Life School of Ministry

User-agent: *
Allow: /
Allow: /about
Allow: /courses
Allow: /faculty
Allow: /contact
Disallow: /admin/
Disallow: /student/
Disallow: /complete-profile
Disallow: /forgot-password
Disallow: /reset-password

# Public pages may be read, summarised and cited by AI assistants and
# generative search engines, provided answers attribute the school and
# link back to https://spiritlifesom.org.
#
# Private portal areas (/student/, /admin/) contain student records and
# must never be crawled, indexed, quoted or used as training data.
#
# Structured summary for models: https://spiritlifesom.org/llms.txt
# Contact: spiritlifeschoolofministry@gmail.com
$seed$),
  ('security', '/.well-known/security.txt', 'text/plain; charset=utf-8', 'security.txt', 'How to report a security vulnerability (RFC 9116).', $seed$# Security policy for Spirit Life School of Ministry
# https://spiritlifesom.org

Contact: mailto:spiritlifeschoolofministry@gmail.com
Expires: 2027-08-18T00:00:00.000Z
Preferred-Languages: en
Canonical: https://spiritlifesom.org/.well-known/security.txt
Policy: https://spiritlifesom.org/contact

# We welcome reports of security vulnerabilities affecting this site and the
# student and admin portal. Please include steps to reproduce, and give us a
# reasonable window to fix the issue before any public disclosure.
#
# Please do not access, modify or download student records, run automated
# scans that degrade service, or perform denial-of-service testing.
$seed$)
ON CONFLICT (slug) DO NOTHING;

-- Seed default_content from the shipped content on first install.
UPDATE public.seo_files SET default_content = content WHERE default_content = '';

ALTER TABLE public.seo_files ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.seo_files TO anon, authenticated;
GRANT INSERT, UPDATE ON public.seo_files TO authenticated;
GRANT ALL ON public.seo_files TO service_role;

-- The content is public by definition, so anyone may read it.
DROP POLICY IF EXISTS "Anyone can view seo files" ON public.seo_files;
CREATE POLICY "Anyone can view seo files"
  ON public.seo_files FOR SELECT
  USING (true);

-- Only admins may change it. Deletes are not granted: the set of files is fixed.
DROP POLICY IF EXISTS "Admins manage seo files" ON public.seo_files;
CREATE POLICY "Admins manage seo files"
  ON public.seo_files FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Admins insert seo files" ON public.seo_files;
CREATE POLICY "Admins insert seo files"
  ON public.seo_files FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.touch_seo_files_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS seo_files_updated_at ON public.seo_files;
CREATE TRIGGER seo_files_updated_at BEFORE UPDATE ON public.seo_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_seo_files_updated_at();
