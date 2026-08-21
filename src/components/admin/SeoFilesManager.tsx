import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RotateCcw,
  Save,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { SITE_ORIGIN } from "@/components/SEO";

interface SeoFile {
  id: string;
  slug: string;
  path: string;
  content_type: string;
  label: string;
  description: string | null;
  content: string;
  default_content: string;
  is_published: boolean;
  updated_at: string;
  updated_by: string | null;
}

type Issue = { level: "error" | "warning"; message: string };

/** Public routes that belong in the sitemap, mirroring the routes in App.tsx. */
const SITEMAP_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.8" },
  { path: "/courses", changefreq: "monthly", priority: "0.8" },
  { path: "/faculty", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", changefreq: "monthly", priority: "0.7" },
  { path: "/login", changefreq: "monthly", priority: "0.5" },
  { path: "/register", changefreq: "monthly", priority: "0.9" },
];

const buildSitemap = () => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = SITEMAP_ROUTES.map(
    (r) =>
      `  <url>\n    <loc>${SITE_ORIGIN}${r.path}</loc>\n    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
};

/**
 * Catches the mistakes that actually cost traffic or break a spec — an
 * accidental site-wide Disallow, malformed sitemap XML, a security.txt with no
 * contact or a lapsed Expires date.
 */
const validate = (slug: string, text: string): Issue[] => {
  const issues: Issue[] = [];
  const body = text.trim();

  if (!body) {
    issues.push({ level: "error", message: "File is empty — the built-in default will be served instead." });
    return issues;
  }

  if (slug === "robots" || slug === "ai") {
    const lines = body.split("\n").map((l) => l.trim());
    let inWildcardGroup = false;
    for (const line of lines) {
      if (/^user-agent:/i.test(line)) inWildcardGroup = line.split(":")[1]?.trim() === "*";
      if (inWildcardGroup && /^disallow:\s*\/\s*$/i.test(line)) {
        issues.push({
          level: "error",
          message: "\"Disallow: /\" under \"User-agent: *\" blocks the whole site from every crawler.",
        });
      }
    }
    if (!lines.some((l) => /^user-agent:/i.test(l))) {
      issues.push({ level: "error", message: "No User-agent line — crawlers will ignore this file." });
    }
    if (slug === "robots") {
      if (!/^sitemap:\s*http/im.test(body)) {
        issues.push({ level: "warning", message: "No Sitemap: line. Search engines find pages faster with one." });
      }
      if (!/disallow:\s*\/student/i.test(body) || !/disallow:\s*\/admin/i.test(body)) {
        issues.push({
          level: "warning",
          message: "The /student and /admin portal areas are not both disallowed.",
        });
      }
    }
  }

  if (slug === "sitemap") {
    try {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        issues.push({ level: "error", message: "Invalid XML — search engines will reject this sitemap." });
      } else {
        const locs = Array.from(doc.getElementsByTagName("loc"));
        if (locs.length === 0) {
          issues.push({ level: "error", message: "No <loc> entries — the sitemap lists no pages." });
        }
        const bad = locs.filter((l) => !(l.textContent || "").startsWith("http"));
        if (bad.length) {
          issues.push({ level: "error", message: `${bad.length} <loc> entries are not absolute URLs.` });
        }
      }
    } catch {
      issues.push({ level: "error", message: "Could not parse the sitemap as XML." });
    }
  }

  if (slug === "security") {
    if (!/^contact:\s*\S+/im.test(body)) {
      issues.push({ level: "error", message: "Missing a Contact: line — required by RFC 9116." });
    }
    const expires = body.match(/^expires:\s*(\S+)/im)?.[1];
    if (!expires) {
      issues.push({ level: "error", message: "Missing an Expires: line — required by RFC 9116." });
    } else {
      const when = new Date(expires);
      if (Number.isNaN(when.getTime())) {
        issues.push({ level: "error", message: "Expires: is not a valid ISO 8601 date." });
      } else {
        const days = Math.round((when.getTime() - Date.now()) / 86_400_000);
        if (days < 0) {
          issues.push({ level: "error", message: `Expired ${Math.abs(days)} days ago — renew it below.` });
        } else if (days < 30) {
          issues.push({ level: "warning", message: `Expires in ${days} days — renew it soon.` });
        }
      }
    }
  }

  if (slug === "llms" && !/^#\s+\S/m.test(body)) {
    issues.push({
      level: "warning",
      message: "No top-level \"# Heading\" — llms.txt readers expect the site name as the first heading.",
    });
  }

  return issues;
};

/** Rewrites (or adds) the Expires line in a security.txt body, one year out. */
const renewExpiry = (text: string) => {
  const next = new Date();
  next.setFullYear(next.getFullYear() + 1);
  const line = `Expires: ${next.toISOString().replace(/\.\d{3}Z$/, ".000Z")}`;
  return /^expires:.*$/im.test(text)
    ? text.replace(/^expires:.*$/im, line)
    : text.replace(/^(contact:.*)$/im, `$1\n${line}`);
};

const SeoFilesManager = () => {
  const { profile } = useAuth();
  const [files, setFiles] = useState<SeoFile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [active, setActive] = useState("robots");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("seo_files")
      .select("id, slug, path, content_type, label, description, content, default_content, is_published, updated_at, updated_by")
      .order("slug");
    if (error) {
      toast.error("Failed to load SEO files");
      setLoading(false);
      return;
    }
    const rows = (data as SeoFile[]) || [];
    setFiles(rows);
    setDrafts({});
    if (rows.length && !rows.some((f) => f.slug === active)) setActive(rows[0].slug);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyOf = (file: SeoFile) => drafts[file.id] ?? file.content;
  const isDirty = (file: SeoFile) => drafts[file.id] !== undefined && drafts[file.id] !== file.content;
  const dirtyCount = useMemo(
    () => files.filter((f) => drafts[f.id] !== undefined && drafts[f.id] !== f.content).length,
    [files, drafts],
  );

  const setBody = (file: SeoFile, value: string) =>
    setDrafts((prev) => ({ ...prev, [file.id]: value }));

  const save = async (file: SeoFile) => {
    const body = bodyOf(file);
    const issues = validate(file.slug, body);
    if (issues.some((i) => i.level === "error")) {
      toast.error("Fix the errors before saving");
      return;
    }
    setSaving(file.id);
    const { error } = await supabase
      .from("seo_files")
      .update({ content: body, updated_by: profile?.id ?? null })
      .eq("id", file.id);
    setSaving(null);
    if (error) {
      toast.error(`Could not save ${file.label}`);
      return;
    }
    toast.success(`${file.label} saved — live within 5 minutes`);
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, content: body, updated_at: new Date().toISOString() } : f)));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[file.id];
      return next;
    });
  };

  const togglePublished = async (file: SeoFile, next: boolean) => {
    setSaving(file.id);
    const { error } = await supabase
      .from("seo_files")
      .update({ is_published: next, updated_by: profile?.id ?? null })
      .eq("id", file.id);
    setSaving(null);
    if (error) {
      toast.error("Could not change that");
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, is_published: next } : f)));
    toast.success(next ? `${file.label} is being served` : `${file.label} fell back to the built-in default`);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!files.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SEO &amp; crawler files</CardTitle>
          <CardDescription>
            No files found. Run the <code>seo_files</code> migration on the database, then reload this page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>SEO, AI &amp; security files</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              These are the files search engines, AI assistants and security researchers read. Edits go
              live at the public address within about five minutes — no redeploy needed.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <Badge variant="secondary">{dirtyCount} unsaved</Badge>
            )}
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Reload
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={active} onValueChange={setActive} className="w-full">
          <TabsList className="mb-6 h-auto w-full lg:grid lg:grid-cols-5">
            {files.map((f) => (
              <TabsTrigger key={f.slug} value={f.slug} className="gap-2 text-xs sm:text-sm">
                {f.label}
                {isDirty(f) && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="unsaved" />}
              </TabsTrigger>
            ))}
          </TabsList>

          {files.map((file) => {
            const body = bodyOf(file);
            const issues = validate(file.slug, body);
            const errors = issues.filter((i) => i.level === "error");
            const publicUrl = `${SITE_ORIGIN}${file.path}`;

            return (
              <TabsContent key={file.slug} value={file.slug} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{file.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{file.path}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(publicUrl);
                          toast.success("Address copied");
                        }}
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-6 items-center gap-1 px-2 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> View live
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      id={`publish-${file.slug}`}
                      checked={file.is_published}
                      disabled={saving === file.id}
                      onCheckedChange={(v) => togglePublished(file, v)}
                    />
                    <Label htmlFor={`publish-${file.slug}`} className="text-xs text-muted-foreground">
                      Serve this file
                    </Label>
                  </div>
                </div>

                <Textarea
                  value={body}
                  onChange={(e) => setBody(file, e.target.value)}
                  spellCheck={false}
                  className="min-h-[420px] font-mono text-xs leading-relaxed"
                  aria-label={`${file.label} contents`}
                />

                {issues.length > 0 && (
                  <div className="space-y-1.5">
                    {issues.map((issue, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                          issue.level === "error"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {issues.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    No problems found.
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setBody(file, file.default_content)}
                      disabled={body === file.default_content}
                    >
                      <RotateCcw className="h-4 w-4" /> Reset to default
                    </Button>

                    {file.slug === "security" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setBody(file, renewExpiry(body))}
                      >
                        <CalendarClock className="h-4 w-4" /> Renew for a year
                      </Button>
                    )}

                    {file.slug === "sitemap" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setBody(file, buildSitemap())}
                      >
                        <RefreshCw className="h-4 w-4" /> Rebuild from public pages
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(file.updated_at).toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => save(file)}
                      disabled={!isDirty(file) || errors.length > 0 || saving === file.id}
                    >
                      {saving === file.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save {file.label}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SeoFilesManager;
