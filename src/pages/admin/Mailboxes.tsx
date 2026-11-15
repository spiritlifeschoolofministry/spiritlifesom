/**
 * The school's official mailboxes, in one place.
 *
 * The student record already carries a mailbox card, and for students that is
 * the natural place to issue one -- it sits beside everything else about that
 * person. This page exists for the two things that record cannot do:
 *
 *   1. **Staff.** A lecturer or an administrator has a profile but no student
 *      record, so there is no other screen in the portal where their address
 *      could be issued.
 *   2. **The whole list.** "Who has a school address, and is the mail server
 *      even answering" is a question about the system, not about a person.
 *
 * Nothing here talks to the mail server directly. Every action goes through the
 * mailbox-admin edge function, which holds the API key.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, PlugZap, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/portal/PageSkeleton";
import { AdminPageHeader, Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { MailboxCard } from "@/components/admin/MailboxCard";
import type { Tables } from "@/integrations/supabase/types";

interface MailboxRow extends Tables<"mailboxes"> {
  profile: { first_name: string | null; last_name: string | null; role: string | null } | null;
}

interface PersonRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
}

const nameOf = (p: { first_name?: string | null; last_name?: string | null } | null) =>
  `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || "Unknown";

const AdminMailboxes = () => {
  const [rows, setRows] = useState<MailboxRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PersonRow | null>(null);

  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("mailboxes")
      .select("*, profile:profiles(first_name, last_name, role)")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Load mailboxes error:", error);
      toast.error("Could not load the mailboxes");
    }
    setRows((data ?? []) as unknown as MailboxRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Confirms the portal can actually reach the mail server.
   *
   * Worth its own button because every other failure here looks the same to an
   * admin: a missing secret, a revoked API key and a server that is down all
   * surface as "could not create the mailbox" on the one occasion somebody is
   * trying to get a new student set up.
   */
  const checkConnection = async () => {
    setChecking(true);
    const { data, error } = await supabase.functions.invoke("mailbox-admin", {
      body: { action: "probe" },
    });
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
    if (data?.ok) toast.success("The mail server answered");
    else toast.error(data?.detail ? String(data.detail).slice(0, 180) : "The mail server did not answer");
  };

  // Who already has one, so the picker can say so before an admin clicks.
  const haveMailboxes = useMemo(
    () => new Set(rows.filter((r) => r.status === "active").map((r) => r.profile_id)),
    [rows],
  );

  const search = useCallback(async (term: string) => {
    const value = term.trim();
    if (value.length < 2) {
      setPeople([]);
      return;
    }
    setSearching(true);
    const pattern = `%${value}%`;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, role")
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("first_name")
      .limit(12);
    setSearching(false);
    if (error) {
      console.error("Search people error:", error);
      toast.error("Could not search for people");
      return;
    }
    setPeople((data ?? []) as PersonRow[]);
  }, []);

  // Debounced: this fires on every keystroke otherwise, and the name people
  // search by is usually only unique after five or six letters.
  useEffect(() => {
    const timer = setTimeout(() => void search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  if (loading) return <PageSkeleton />;

  const active = rows.filter((r) => r.status === "active");
  const removed = rows.filter((r) => r.status !== "active");

  return (
    <div className="space-y-5">
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
      />

      <Panel
        title="Issue a mailbox"
        titleId="issue-mailbox"
        description="Find the student or staff member first."
      >
        <div className="space-y-4 px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Search by name or email…"
              className="pl-9"
              autoComplete="off"
            />
          </div>

          {!selected && query.trim().length >= 2 && (
            <div className="rounded-[14px] border border-border">
              {searching && (
                <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </p>
              )}
              {!searching && people.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">Nobody matches that.</p>
              )}
              {!searching && people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelected(person)}
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{nameOf(person)}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{person.email}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusPill tone="neutral">{person.role}</StatusPill>
                    {haveMailboxes.has(person.id)
                      ? <StatusPill tone="good">Has one</StatusPill>
                      : <UserPlus className="h-4 w-4 text-muted-foreground" />}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{nameOf(selected)}</span> — {selected.email}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Choose someone else</Button>
              </div>
              {/* The same card the student record uses, so there is one
                  implementation of create / reset / delete and one place the
                  one-time password is handled. */}
              <MailboxCard
                key={selected.id}
                profileId={selected.id}
                personName={nameOf(selected)}
              />
            </div>
          )}
        </div>
      </Panel>

      <Panel title={`Active mailboxes (${active.length})`} titleId="active-mailboxes">
        {active.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No mailboxes have been issued yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <code className="block truncate font-mono text-sm text-foreground">{row.address}</code>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {nameOf(row.profile)}
                    {row.profile?.role ? ` · ${row.profile.role}` : ""}
                    {` · issued ${new Date(row.created_at).toLocaleDateString()}`}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!row.stalwart_account_id && <StatusPill tone="bad">Unfinished</StatusPill>}
                  {/* Selects the owner in the card above rather than
                      navigating: reset and delete already live there. */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelected({
                        id: row.profile_id,
                        first_name: row.profile?.first_name ?? null,
                        last_name: row.profile?.last_name ?? null,
                        email: row.address,
                        role: row.profile?.role ?? "",
                      });
                      setQuery(nameOf(row.profile));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Manage
                  </Button>
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
                <div className="min-w-0">
                  <code className="block truncate font-mono text-sm text-muted-foreground line-through">
                    {row.address}
                  </code>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {nameOf(row.profile)}
                    {row.removed_at ? ` · deleted ${new Date(row.removed_at).toLocaleDateString()}` : ""}
                  </span>
                </div>
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
};

export default AdminMailboxes;
