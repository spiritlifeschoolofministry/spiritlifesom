/**
 * The school's official mailboxes, in one place.
 *
 * This page answers "who has a school address and who should" for *everyone* --
 * students and staff alike. Staff matter as much as students here and have no
 * student record anywhere else in the portal, so this is the only screen where
 * an administrator or lecturer can be given an address at all.
 *
 * The list is shown up front rather than behind a search box. Issuing mailboxes
 * is bulk work done once a cohort arrives: an admin wants to see the 2026/2027
 * students who have no address yet and work down them, not type 102 names. So
 * the filters are the interface, and search is one filter among several.
 *
 * Everything loads in one pass and filters in memory. That is a deliberate
 * choice at this size -- about a hundred profiles -- because it makes every
 * filter instant and the counts exact. If the school ever grows past a few
 * thousand people this should move to a server-side query.
 *
 * Two tabs, because the page serves two jobs that want opposite shapes. Issuing
 * is a worklist over *people*, most of whom have no mailbox; reviewing is a list
 * of *mailboxes*, which is a much smaller set and is what you want when a
 * student says they cannot get in. One list trying to be both was mostly rows
 * you did not care about either way.
 *
 * Nothing here talks to the mail server directly. Every action goes through the
 * mailbox-admin edge function, which holds the API key.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, PlugZap, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageSkeleton } from "@/components/portal/PageSkeleton";
import { AdminPageHeader, KpiTile, Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { MailboxCard } from "@/components/admin/MailboxCard";
import { OffPortalMailboxForm } from "@/components/admin/OffPortalMailboxForm";
import type { Tables } from "@/integrations/supabase/types";

type Mailbox = Tables<"mailboxes">;

/** One row of the list: a person, plus the mailbox they do or do not have. */
interface Person {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string;
  role: string;
  /** Null for staff, and for a student not yet placed in a cohort. */
  cohortId: string | null;
  cohortName: string | null;
  isStaff: boolean;
  mailbox: Mailbox | null;
}

type RoleFilter = "all" | "students" | "staff";
type MailFilter = "all" | "with" | "without";
type MailboxTab = "issue" | "active";

/** Matches the underlined header tabs used on Fees. */
const TAB_TRIGGER =
  "h-11 shrink-0 rounded-none border-b-[3px] border-transparent bg-transparent px-4 text-[15px] font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

const nameOf = (first: string | null, last: string | null) =>
  `${first || ""} ${last || ""}`.trim() || "Unnamed";

const AdminMailboxes = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [removed, setRemoved] = useState<Mailbox[]>([]);
  /**
   * Live mailboxes belonging to nobody on the portal.
   *
   * Kept apart from `people` because they have no profile to hang off: no
   * role, no cohort, nothing to filter by but their name and address. They
   * still belong on the Active tab, which is a list of addresses rather than
   * of people.
   */
  const [offPortal, setOffPortal] = useState<Mailbox[]>([]);
  const [cohorts, setCohorts] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [mailFilter, setMailFilter] = useState<MailFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<MailboxTab>("issue");

  const load = useCallback(async () => {
    const [profilesRes, studentsRes, mailboxesRes, cohortsRes] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, email, role"),
      // is_staff_preview rows are the admins' own dummy student records. Letting
      // one through would file an administrator under a cohort.
      supabase.from("students").select("profile_id, cohort_id, is_staff_preview, cohort:cohorts(name)")
        .eq("is_staff_preview", false),
      supabase.from("mailboxes").select("*"),
      supabase.from("cohorts").select("id, name").order("name", { ascending: false }),
    ]);

    const firstError = profilesRes.error || studentsRes.error || mailboxesRes.error || cohortsRes.error;
    if (firstError) {
      console.error("Load mailboxes page error:", firstError);
      toast.error("Could not load the people list");
      setLoading(false);
      return;
    }

    const studentByProfile = new Map(
      (studentsRes.data ?? []).map((s) => [
        s.profile_id,
        { cohortId: s.cohort_id, cohortName: (s.cohort as { name: string } | null)?.name ?? null },
      ]),
    );
    // Only an active mailbox belongs to a person; a removed one is history and
    // must not make them look as though they already have an address.
    const activeByProfile = new Map(
      ((mailboxesRes.data ?? []) as Mailbox[])
        .filter((m) => m.status === "active")
        .map((m) => [m.profile_id, m]),
    );

    const rows: Person[] = (profilesRes.data ?? []).map((p) => {
      const student = studentByProfile.get(p.id);
      const role = (p.role || "").toLowerCase();
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        name: nameOf(p.first_name, p.last_name),
        email: p.email,
        role: p.role || "unknown",
        cohortId: student?.cohortId ?? null,
        cohortName: student?.cohortName ?? null,
        isStaff: role !== "student",
        mailbox: activeByProfile.get(p.id) ?? null,
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));

    setPeople(rows);
    setRemoved(((mailboxesRes.data ?? []) as Mailbox[]).filter((m) => m.status !== "active"));
    setOffPortal(
      ((mailboxesRes.data ?? []) as Mailbox[])
        .filter((m) => m.status === "active" && !m.profile_id),
    );
    setCohorts(cohortsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Confirms the portal can actually reach the mail server.
   *
   * Worth its own button because every other failure looks the same to an
   * admin: a missing secret, a revoked API key and a server that is down all
   * surface as "could not create the mailbox", on the one occasion somebody is
   * trying to get a new student set up.
   */
  const checkConnection = async () => {
    setChecking(true);
    const { data, error } = await supabase.functions.invoke("mailbox-admin", { body: { action: "probe" } });
    setChecking(false);
    if (error) {
      let message = "Could not reach the mail server";
      try {
        const parsed = await (error as { context?: Response }).context?.json();
        if (parsed?.error) message = String(parsed.error);
      } catch { /* keep the generic message */ }
      toast.error(message);
      return;
    }
    if (data?.ok) toast.success(`The mail server answered — ${data.detail ?? "ok"}`);
    else toast.error(data?.detail ? String(data.detail).slice(0, 180) : "The mail server did not answer");
  };

  /**
   * The filter predicate, able to ignore one or more facets.
   *
   * Every figure on this page describes the rows the page is actually showing,
   * so the counts have to come from the same predicate the list does. The
   * `skip` argument is what keeps the tiles usable as navigation: a tile that
   * toggles a facet must not count through that facet, or picking "No mailbox
   * yet" would drive "With a mailbox" to zero and you could never click back.
   * This is ordinary faceted counting -- each facet's figure is computed with
   * every *other* filter applied.
   */
  const matches = useCallback(
    (p: Person, skip: Array<"role" | "cohort" | "mail" | "query"> = []) => {
      const off = (facet: "role" | "cohort" | "mail" | "query") => skip.includes(facet);

      if (!off("role")) {
        if (roleFilter === "students" && p.isStaff) return false;
        if (roleFilter === "staff" && !p.isStaff) return false;
      }
      if (!off("cohort")) {
        // "No cohort" catches students who have not been placed yet, which is
        // exactly the group that gets forgotten when addresses are handed out.
        if (cohortFilter === "none" && p.cohortId !== null) return false;
        if (cohortFilter !== "all" && cohortFilter !== "none" && p.cohortId !== cohortFilter) return false;
      }
      if (!off("mail")) {
        if (mailFilter === "with" && !p.mailbox) return false;
        if (mailFilter === "without" && p.mailbox) return false;
      }
      if (!off("query")) {
        const term = query.trim().toLowerCase();
        if (term) {
          const haystack = `${p.name} ${p.email} ${p.mailbox?.address ?? ""}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
      }
      return true;
    },
    [roleFilter, cohortFilter, mailFilter, query],
  );

  const filtered = useMemo(() => people.filter((p) => matches(p)), [people, matches]);

  const stats = useMemo(() => {
    // The mailbox facet is left out of its own three tiles, and the role and
    // cohort facets out of the Staff tile -- staff have no cohort at all, so
    // counting them through a cohort filter would always show nought.
    const scope = people.filter((p) => matches(p, ["mail"]));
    const withBox = scope.filter((p) => p.mailbox).length;
    return {
      total: scope.length,
      withBox,
      without: scope.length - withBox,
      staff: people.filter((p) => matches(p, ["role", "cohort"]) && p.isStaff).length,
    };
  }, [people, matches]);

  /**
   * What the figures above currently describe.
   *
   * A tile reading "12" means something very different for the whole school
   * than for one cohort, and the number alone cannot say which. Naming the
   * scope on the tile is what stops a filtered figure being read, or reported,
   * as a school-wide one.
   */
  const scopeNote = useMemo(() => {
    const bits: string[] = [];
    if (roleFilter === "students") bits.push("students");
    if (roleFilter === "staff") bits.push("staff");
    if (cohortFilter === "none") bits.push("no cohort");
    else if (cohortFilter !== "all") {
      bits.push(cohorts.find((c) => c.id === cohortFilter)?.name ?? "one cohort");
    }
    if (query.trim()) bits.push(`matching “${query.trim()}”`);
    return bits.length ? `in ${bits.join(", ")}` : null;
  }, [roleFilter, cohortFilter, query, cohorts]);

  const selected = useMemo(
    () => people.find((p) => p.id === selectedId) ?? null,
    [people, selectedId],
  );

  /**
   * The Active tab's list.
   *
   * Filtered by the same bar as the Issue tab, minus the mailbox facet, which
   * this list already is. Without that, filtering to one cohort would narrow
   * the figures and the Issue list while leaving this tab showing every
   * address in the school -- two answers to the same question on one page.
   */
  const issued = useMemo(
    () => people
      .filter((p) => p.mailbox && matches(p, ["mail"]))
      .sort((a, b) => (a.mailbox!.address).localeCompare(b.mailbox!.address)),
    [people, matches],
  );

  /**
   * Off-portal mailboxes that survive the current filters.
   *
   * They carry no role and no cohort, so a role or cohort filter excludes them
   * rather than silently keeping them: asked for "students in 2026/2027", a
   * board member is not an answer. Search still reaches them by name or
   * address, which is how you find one.
   */
  const offPortalShown = useMemo(() => {
    if (roleFilter !== "all" || cohortFilter !== "all") return [];
    if (mailFilter === "without") return [];
    const term = query.trim().toLowerCase();
    return offPortal
      .filter((m) => !term || `${m.holder_name ?? ""} ${m.address}`.toLowerCase().includes(term))
      .sort((a, b) => a.address.localeCompare(b.address));
  }, [offPortal, roleFilter, cohortFilter, mailFilter, query]);

  /** Opens a person in the issue tab's card, wherever you clicked from. */
  const openPerson = (id: string) => {
    setSelectedId(id);
    setTab("issue");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filtersActive = roleFilter !== "all" || cohortFilter !== "all" || mailFilter !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setRoleFilter("all");
    setCohortFilter("all");
    setMailFilter("all");
    setQuery("");
  };

  if (loading) return <PageSkeleton />;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as MailboxTab)} className="space-y-5">
      <AdminPageHeader
        section="System"
        title="Mailboxes"
        description="Official @spiritlifesom.org addresses for students and staff."
        actions={
          <Button variant="outline" size="sm" onClick={checkConnection} disabled={checking}>
            {checking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1.5 h-4 w-4" />}
            Check connection
          </Button>
        }
        tabs={
          <TabsList aria-label="Mailbox sections" className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0">
            <TabsTrigger value="issue" className={TAB_TRIGGER}>
              Issue a mailbox
              {stats.without > 0 && (
                <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  {stats.without}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="active" className={TAB_TRIGGER}>
              Active mailboxes
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground/80">
                {stats.withBox + offPortal.length}
              </span>
            </TabsTrigger>
          </TabsList>
        }
      />

      {/* Page-level summary, above the tabs: each tile is also a shortcut to
          the view that answers it. "47 without a mailbox" is a to-do list, so
          clicking it should put you in front of that list. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="People" value={stats.total} note={scopeNote ?? "students and staff"}
          onClick={() => { setTab("issue"); clearFilters(); }}
        />
        <KpiTile
          label="With a mailbox" value={stats.withBox} tone="good" note={scopeNote ?? "click to review"}
          onClick={() => setTab("active")} pressed={tab === "active"}
        />
        <KpiTile
          label="Without one" value={stats.without} tone={stats.without ? "warn" : "neutral"}
          note={scopeNote ?? "click to list them"}
          onClick={() => { setTab("issue"); setMailFilter("without"); }}
          pressed={tab === "issue" && mailFilter === "without"}
        />
        <KpiTile
          label="Staff" value={stats.staff} note="no student record"
          onClick={() => { setTab("issue"); setRoleFilter("staff"); }}
          pressed={tab === "issue" && roleFilter === "staff"}
        />
      </div>

      {selected && (
        <Panel
          title={`Mailbox for ${selected.name}`}
          titleId="selected-mailbox"
          description={selected.email}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
              <X className="mr-1.5 h-4 w-4" /> Close
            </Button>
          }
        >
          <div className="px-5 py-4">
            {/* The same card the student record uses, so create / reset / delete
                and the one-time password have exactly one implementation. */}
            <MailboxCard
              key={selected.id}
              profileId={selected.id}
              personName={selected.name}
              onChanged={load}
            />
          </div>
        </Panel>
      )}

      {/* Page-wide, not per-tab: both lists and every figure above read these,
          so the page can only ever give one answer about who is in scope. */}
      <Panel
        title="Filter"
        titleId="filters"
        description={
          filtered.length === people.length
            ? `All ${people.length} people`
            : `${filtered.length} of ${people.length} people`
        }
        actions={
          filtersActive ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-2 px-5 py-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email or address…"
                className="pl-9"
                autoComplete="off"
              />
            </div>

            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="students">Students</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cohortFilter} onValueChange={setCohortFilter}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cohorts</SelectItem>
                {cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value="none">No cohort / staff</SelectItem>
              </SelectContent>
            </Select>

            <Select value={mailFilter} onValueChange={(v) => setMailFilter(v as MailFilter)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mailbox: any</SelectItem>
                <SelectItem value="with">Has a mailbox</SelectItem>
                <SelectItem value="without">No mailbox yet</SelectItem>
              </SelectContent>
            </Select>
          </div>

      </Panel>

      {/* --- Issue: a worklist over people ---------------------------------- */}
      <TabsContent value="issue" className="m-0 space-y-5">
        {/* Above the list, not below it. The school has a hundred people in
            that list, so anything underneath it is a scroll nobody makes --
            and this is the only route to a mailbox for someone who has no
            portal account at all. */}
        <OffPortalMailboxForm onCreated={load} />

        {/* The count and the Clear button live on the Filter panel above, which
            owns them for both tabs; repeating them here would be two controls
            for one piece of state. */}
        <Panel title={`People (${filtered.length})`} titleId="people">
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nobody matches these filters.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((p) => (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 ${
                    p.id === selectedId ? "bg-muted/60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {p.mailbox ? <code className="font-mono">{p.mailbox.address}</code> : p.email}
                    </span>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {p.isStaff
                      ? <StatusPill tone="info">{p.role}</StatusPill>
                      : p.cohortName
                        ? <StatusPill tone="neutral">{p.cohortName}</StatusPill>
                        : <StatusPill tone="warn">No cohort</StatusPill>}

                    {p.mailbox
                      ? <StatusPill tone="good">Has mailbox</StatusPill>
                      : <StatusPill tone="neutral">None</StatusPill>}

                    <Button
                      variant={p.mailbox ? "outline" : "default"}
                      size="sm"
                      onClick={() => openPerson(p.id)}
                    >
                      {p.mailbox ? "Manage" : "Issue"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </TabsContent>

      {/* --- Active: a list of mailboxes ------------------------------------ */}
      <TabsContent value="active" className="m-0 space-y-5">
        <Panel
          title={`Active mailboxes (${issued.length + offPortalShown.length})`}
          titleId="active-mailboxes"
          description="Every address currently live on the mail server."
        >
          {issued.length + offPortalShown.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No mailboxes have been issued yet. Use the <strong>Issue a mailbox</strong> tab to create the first one.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {issued.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <code className="block truncate font-mono text-sm text-foreground">{p.mailbox!.address}</code>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {p.name}
                      {` · issued ${new Date(p.mailbox!.created_at).toLocaleDateString()}`}
                      {p.mailbox!.password_reset_at
                        ? ` · reset ${new Date(p.mailbox!.password_reset_at).toLocaleDateString()}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {p.isStaff
                      ? <StatusPill tone="info">{p.role}</StatusPill>
                      : p.cohortName
                        ? <StatusPill tone="neutral">{p.cohortName}</StatusPill>
                        : <StatusPill tone="warn">No cohort</StatusPill>}
                    {p.mailbox!.is_server_admin && <StatusPill tone="bad">Server admin</StatusPill>}
                    {/* A row with no account id means the create was interrupted
                        before the mail server confirmed -- see mailbox-admin. */}
                    {!p.mailbox!.stalwart_account_id && <StatusPill tone="bad">Unfinished</StatusPill>}
                    <Button variant="outline" size="sm" onClick={() => openPerson(p.id)}>Manage</Button>
                  </div>
                </li>
              ))}

              {/* Off-portal holders. No role or cohort to show, so the pill
                  says what they are instead -- otherwise an address with no
                  badge next to it reads as missing data. */}
              {offPortalShown.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <code className="block truncate font-mono text-sm text-foreground">{m.address}</code>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {m.holder_name}
                      {m.holder_email ? ` · ${m.holder_email}` : ""}
                      {` · issued ${new Date(m.created_at).toLocaleDateString()}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusPill tone="info">Not on the portal</StatusPill>
                    {m.is_server_admin && <StatusPill tone="bad">Server admin</StatusPill>}
                    {!m.stalwart_account_id && <StatusPill tone="bad">Unfinished</StatusPill>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {removed.length > 0 && (
          <Panel
            title={`Deleted (${removed.length})`}
            titleId="removed-mailboxes"
            description="Kept on file so these addresses are never given to anyone else."
          >
            <ul className="divide-y divide-border">
              {removed.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground line-through">
                    {row.address}
                  </code>
                  <span className="shrink-0 text-[13px] text-muted-foreground">
                    {row.removed_at ? `deleted ${new Date(row.removed_at).toLocaleDateString()}` : ""}
                  </span>
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default AdminMailboxes;
