import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { CalendarCheck, CalendarDays, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Item {
  key: string;
  time: string;
  title: string;
  sub: string;
  cta: string;
  href: string;
  kind: "class" | "exam" | "event";
}

const ICON = { class: CalendarCheck, exam: ClipboardCheck, event: CalendarDays } as const;

/**
 * Today on the admin Home: classes on the schedule, exam windows that open
 * today, and school events running today, in time order, each with the page
 * where you act on it. Renders nothing on a day with nothing scheduled.
 */
const AdminToday = () => {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const today = format(now, "yyyy-MM-dd");
      const dayStart = new Date(`${today}T00:00:00`).toISOString();
      const dayEnd = new Date(`${today}T23:59:59`).toISOString();
      const [{ data: classes }, { data: exams }, { data: events }] = await Promise.all([
        supabase
          .from("schedule")
          .select("id, start_time, end_time, activity_type, counts_for_attendance, courses(code), cohorts(name)")
          .eq("date", today)
          .order("start_time", { ascending: true }),
        supabase
          .from("exams")
          .select("id, title, start_at, end_at, status")
          .in("status", ["published", "in_progress"])
          .lte("start_at", dayEnd)
          .gte("end_at", dayStart)
          .order("start_at", { ascending: true }),
        supabase
          .from("school_events")
          .select("id, title, start_date, end_date, category")
          .lte("start_date", today)
          .or(`end_date.gte.${today},and(end_date.is.null,start_date.eq.${today})`),
      ]);
      if (cancelled) return;

      const list: Item[] = [];
      for (const c of classes ?? []) {
        const course = (c.courses as { code?: string } | null)?.code;
        const cohort = (c.cohorts as { name?: string } | null)?.name;
        list.push({
          key: `c-${c.id}`,
          time: c.start_time ? c.start_time.slice(0, 5) : "—",
          title: [course, c.activity_type || "Class"].filter(Boolean).join(" · "),
          sub: [cohort, c.end_time ? `until ${c.end_time.slice(0, 5)}` : null, c.counts_for_attendance ? "counts for attendance" : null].filter(Boolean).join(" · "),
          cta: "Attendance",
          href: "/admin/attendance",
          kind: "class",
        });
      }
      for (const e of exams ?? []) {
        list.push({
          key: `e-${e.id}`,
          time: format(new Date(e.start_at), "HH:mm"),
          title: e.title,
          sub: `Open until ${format(new Date(e.end_at), "HH:mm")}`,
          cta: "Monitor",
          href: `/admin/exams/${e.id}/monitor`,
          kind: "exam",
        });
      }
      for (const ev of events ?? []) {
        list.push({
          key: `v-${ev.id}`,
          time: "All day",
          title: ev.title,
          sub: ev.category || "School event",
          cta: "Calendar",
          href: "/admin/calendar",
          kind: "event",
        });
      }
      list.sort((a, b) => (a.time === "All day" ? -1 : b.time === "All day" ? 1 : a.time.localeCompare(b.time)));
      setItems(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section aria-labelledby="admin-today" className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <h2 id="admin-today" className="text-lg font-bold text-foreground">Today</h2>
      <ul className="mt-3 divide-y divide-border">
        {items.map((it) => {
          const Icon = ICON[it.kind];
          return (
            <li key={it.key} className="flex items-center gap-3 py-3">
              <span className="w-14 shrink-0 text-sm font-bold text-muted-foreground">{it.time}</span>
              <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{it.title}</span>
                {it.sub && <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>}
              </span>
              <Link to={it.href} className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-bold text-primary hover:bg-secondary">
                {it.cta}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default AdminToday;
