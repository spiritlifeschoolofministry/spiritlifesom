import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, ListCard, Panel, Pill, ScreenHeader, SectionTitle, StatTile, type Tone } from "@/components/redesign/student-pages/ui";

interface AttendanceRow {
  id: string;
  marked_at: string | null;
  status: string;
  is_verified: boolean;
  check_in_time: string | null;
  schedule_id: string | null;
}

/** One class session the cohort held, with this student's record for it (if any). */
interface SessionRow {
  sessionId: string;
  date: string;
  record: AttendanceRow | null;
}

interface CohortToggle {
  enabled: boolean;
  start_time: string;
  end_time: string;
  late_after: string;
}

interface ClassTodayValue {
  date: string;
  cohorts: Record<string, CohortToggle>;
}

const todayDateString = () => new Date().toISOString().split("T")[0];

/** "18:15" → "6:15 pm". Leaves anything it cannot read as it was. */
const clock = (hhmm: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!m) return hhmm || "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();

const StudentAttendance = () => {
  const { student } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [todayScheduleId, setTodayScheduleId] = useState<string | null>(null);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [pendingToday, setPendingToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [cohortToggle, setCohortToggle] = useState<CohortToggle | null>(null);
  const [outsideWindow, setOutsideWindow] = useState(false);
  const [windowMessage, setWindowMessage] = useState("");
  // Today's own record, read from the history already loaded, so the card can
  // say when the student checked in and how it was recorded.
  const [todayRecord, setTodayRecord] = useState<AttendanceRow | null>(null);

  const loadData = useCallback(async () => {
    if (!student?.id) return;
    try {
      const today = todayDateString();
      const todayStart = `${today}T00:00:00`; 
      const todayEnd = `${today}T23:59:59.999`; 

      const { data: studentData } = await supabase.from("students").select("cohort_id").eq("id", student.id).maybeSingle();
      const cohortId = studentData?.cohort_id;

      const [historyRes, classSettingRes, sessionRes] = await Promise.all([
        supabase.from("attendance").select("id, marked_at, status, is_verified, check_in_time, schedule_id").eq("student_id", student.id).order("marked_at", { ascending: false }),
        supabase.from("system_settings").select("value").eq("key", "class_today").maybeSingle(),
        // Every class session this cohort has held to date — the denominator.
        cohortId
          ? supabase.from("schedule").select("id, date").eq("cohort_id", cohortId).eq("counts_for_attendance", true).lte("date", today).order("date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (historyRes.error) throw historyRes.error;
      if (sessionRes.error) throw sessionRes.error;

      const rows = (historyRes.data || []) as AttendanceRow[];
      const recordBySessionId = new Map(rows.filter((r) => r.schedule_id).map((r) => [r.schedule_id as string, r]));
      setSessions(
        (sessionRes.data || []).map((s) => ({
          sessionId: s.id,
          date: s.date,
          record: recordBySessionId.get(s.id) ?? null,
        }))
      );

      let scheduleId: string | null = null;
      let toggle: CohortToggle | null = null;

      if (classSettingRes.data?.value && cohortId) {
        const val = classSettingRes.data.value as unknown as ClassTodayValue;
        if (val.date === today && val.cohorts && val.cohorts[cohortId]) {
          toggle = val.cohorts[cohortId];
        }
      }
      if (!toggle && classSettingRes.data?.value) {
        const legacyVal = classSettingRes.data.value as { date?: string; enabled?: boolean };
        if (legacyVal.date === today && legacyVal.enabled === true && !Object.prototype.hasOwnProperty.call(legacyVal, "cohorts")) {
          toggle = { enabled: true, start_time: "00:00", end_time: "23:59", late_after: "23:59" };
        }
      }
      setCohortToggle(toggle);

      const classEnabled = toggle?.enabled === true;
      if (classEnabled) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = (toggle!.start_time || "00:00").split(":").map(Number);
        const [endH, endM] = (toggle!.end_time || "23:59").split(":").map(Number);
        if (currentMinutes < startH * 60 + startM) {
          setOutsideWindow(true);
          setWindowMessage(`Check-in opens at ${toggle!.start_time}`);
        } else if (currentMinutes > endH * 60 + endM) {
          setOutsideWindow(true);
          setWindowMessage(`Check-in closed at ${toggle!.end_time}`);
        } else {
          setOutsideWindow(false);
          setWindowMessage("");
        }
        const { data: scheduleData } = await supabase.from("schedule").select("id").eq("date", today).eq("cohort_id", cohortId).limit(1);
        scheduleId = scheduleData && scheduleData.length > 0 ? scheduleData[0].id : null;
      } else {
        setOutsideWindow(false);
        setWindowMessage("");
      }

      setTodayScheduleId(scheduleId);

      const { data: todayAttendanceRes, error: todayAttendanceError } = await supabase
        .from("attendance")
        .select("id, marked_at, is_verified, schedule_id")
        .eq("student_id", student.id)
        .gte("marked_at", todayStart)
        .lt("marked_at", todayEnd);

      if (todayAttendanceError) throw todayAttendanceError;
      const todayRecords = (todayAttendanceRes || []).filter((a) => !scheduleId || a.schedule_id === scheduleId);

      setCheckedInToday(todayRecords.length > 0);
      setTodayRecord(rows.find((r) => todayRecords.some((t) => t.id === r.id)) ?? null);
      setPendingToday(todayRecords.some((a) => a.is_verified === false));
    } catch (err) {
      console.error("[StudentAttendance] Load error:", err);
      toast.error("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [student?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCheckIn = async () => {
    if (!student?.id || !todayScheduleId || checkedInToday || checkingIn) return;
    setCheckingIn(true);
    try {
      const now = new Date();

      // Status is decided by a BEFORE INSERT trigger using server time in
      // Africa/Lagos, not this device's clock. What we send is ignored; we read
      // back what was actually stored so the toast tells the truth.
      // Insert-only path to avoid RLS update conflict for student self-check-in.
      const { data: inserted, error } = await supabase
        .from("attendance")
        .insert({
          student_id: student.id,
          schedule_id: todayScheduleId,
          status: "Present",
          check_in_time: now.toISOString(),
          marked_at: now.toISOString(),
          is_verified: false,
        })
        .select("status")
        .maybeSingle();
      const status = inserted?.status ?? "Present";

      // If there is a duplicate key violation, treat as already checked in.
      if (error) {
        const detail = (error)?.details || "";
        const msg = (error)?.message || "";
        if (msg.includes("duplicate key") || detail.includes("duplicate key") || error.code === "23505") {
          setCheckedInToday(true);
          setPendingToday(true);
          toast.success(`Attendance already recorded${status === "Late" ? " (Late)" : ""}. Pending approval.`);
          await loadData();
          return;
        }
        throw error;
      }

      setCheckedInToday(true);
      setPendingToday(true);
      toast.success(`Attendance marked${status === "Late" ? " (Late)" : ""}. Pending approval.`);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to mark attendance");
    } finally {
      setCheckingIn(false);
    }
  };

  // Measured against classes the cohort actually held, not against records that exist.
  // Only verified records count as attended, matching the admin statistics.
  const totalClasses = sessions.length;
  const countedAs = (s: SessionRow) => {
    if (!s.record || !s.record.is_verified) return "ABSENT";
    const status = (s.record.status || "").toUpperCase();
    return status === "PRESENT" || status === "LATE" ? status : "ABSENT";
  };
  /**
   * The same verdict, but telling an excused absence apart for display. It still
   * counts as not attended in the rate, exactly as before.
   */
  const shownAs = (s: SessionRow) =>
    countedAs(s) === "ABSENT" && s.record?.is_verified && (s.record.status || "").toUpperCase() === "EXCUSED"
      ? "EXCUSED"
      : countedAs(s);
  const presentCount = sessions.filter((s) => countedAs(s) === "PRESENT").length;
  const lateCount = sessions.filter((s) => countedAs(s) === "LATE").length;
  const excusedCount = sessions.filter((s) => shownAs(s) === "EXCUSED").length;
  const absentCount = sessions.filter((s) => shownAs(s) === "ABSENT").length;
  const attended = presentCount + lateCount;
  const percentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;

  const STATUS: Record<string, { label: string; tone: Tone }> = {
    PRESENT: { label: "Present", tone: "success" },
    LATE: { label: "Late", tone: "warning" },
    ABSENT: { label: "Absent", tone: "danger" },
    EXCUSED: { label: "Excused", tone: "neutral" },
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 rounded-[20px]" />
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-[14px]" />)}
        </div>
        <Skeleton className="h-64 rounded-[18px]" />
      </div>
    );
  }

  const classEnabled = cohortToggle?.enabled === true;
  const canCheckIn = !checkedInToday && !checkingIn && todayScheduleId !== null && classEnabled && !outsideWindow;

  const todayPill: { label: string; tone: Tone } = checkedInToday
    ? { label: pendingToday ? "Checked in · pending" : "Checked in", tone: "success" }
    : !classEnabled
      ? { label: "No class today", tone: "neutral" }
      : outsideWindow
        ? { label: windowMessage.startsWith("Check-in opens") ? "Not open yet" : "Window closed", tone: "neutral" }
        : { label: "Window open", tone: "gold" };
  const todayStatus = todayRecord ? STATUS[(todayRecord.status || "").toUpperCase()]?.label ?? todayRecord.status : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ScreenHeader title="Attendance" />

      {/* Today's class */}
      <Panel className="space-y-3" aria-labelledby="att-today">
        <div className="flex items-center justify-between gap-2">
          <h2 id="att-today" className="text-base font-bold">Today's class</h2>
          <Pill tone={todayPill.tone}>{todayPill.label}</Pill>
        </div>

        {classEnabled && cohortToggle && (
          <p className="text-[13px] text-muted-foreground">
            Check-in window {clock(cohortToggle.start_time)} – {clock(cohortToggle.end_time)} · late after {clock(cohortToggle.late_after)}
          </p>
        )}
        {!classEnabled && !checkedInToday && (
          <p className="text-[13px] text-muted-foreground">No class has been set for your cohort today.</p>
        )}
        {classEnabled && outsideWindow && !checkedInToday && (
          <p className="text-[13px] font-semibold text-[#8A3F05] dark:text-amber-300">
            {windowMessage.replace(/(\d{1,2}:\d{2})/, (t) => clock(t))}
          </p>
        )}

        {checkedInToday ? (
          <div className="space-y-0.5 rounded-[14px] bg-[#E6F4EE] px-3.5 py-3 text-[#11603F] dark:bg-emerald-500/15 dark:text-emerald-200" role="status">
            <p className="text-[15px] font-bold">
              {todayRecord?.check_in_time ? `Checked in at ${timeOf(todayRecord.check_in_time)}` : "Checked in"}
              {todayStatus ? ` · ${todayStatus}` : ""}
            </p>
            <p className="text-[13px]">
              {pendingToday ? "Waiting for an administrator to verify it." : "Verified by an administrator."}
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={!canCheckIn}
              className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
            >
              {checkingIn ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking in…</>) : "Check in now"}
            </button>
            {classEnabled && (
              <p className="text-xs text-muted-foreground">
                Whether you are on time or late is decided by the school's clock (Lagos time), not your phone.
              </p>
            )}
          </>
        )}
      </Panel>

      {/* Counts */}
      <dl className="grid grid-cols-4 gap-2" aria-label="Your attendance">
        <StatTile value={presentCount} label="Present" valueClassName="text-[#11603F] dark:text-emerald-300" />
        <StatTile value={lateCount} label="Late" valueClassName="text-[#8A3F05] dark:text-amber-300" />
        <StatTile value={absentCount} label="Absent" valueClassName="text-[#8E2A0A] dark:text-red-300" />
        <StatTile value={excusedCount} label="Excused" valueClassName="text-[#3A3450] dark:text-muted-foreground" />
      </dl>

      <Panel className="space-y-2 rounded-2xl px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <strong className="font-bold">Attendance rate</strong>
          <span className="text-muted-foreground">
            {attended} of {totalClasses} class{totalClasses === 1 ? "" : "es"} · {percentage}%
          </span>
        </div>
        <Bar value={percentage} tone={percentage >= 75 ? "success" : "primary"} label={`Attendance rate, ${percentage}%`} />
        <p className="text-xs text-muted-foreground">Only check-ins an administrator has verified count.</p>
      </Panel>

      {/* History */}
      <section aria-labelledby="att-history" className="space-y-2.5">
        <SectionTitle id="att-history">History</SectionTitle>
        {sessions.length === 0 ? (
          <Panel className="py-8 text-center text-sm text-muted-foreground">No classes have been held yet.</Panel>
        ) : (
          <ListCard>
            {sessions.map((s) => {
              const d = new Date(`${s.date}T00:00:00`);
              const st = STATUS[shownAs(s)] ?? { label: shownAs(s), tone: "neutral" as Tone };
              const meta = s.record?.check_in_time
                ? `Checked in ${timeOf(s.record.check_in_time)}`
                : s.record
                  ? "Recorded by an administrator"
                  : "No check-in";
              return (
                <li key={s.sessionId} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2">
                  <span className="flex w-11 shrink-0 flex-col items-center">
                    <strong className="text-[15px]">{d.toLocaleDateString("en-GB", { day: "2-digit" })}</strong>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      {d.toLocaleDateString("en-GB", { month: "short" })}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="text-sm">
                      {d.toLocaleDateString("en-GB", { weekday: "long" })} class
                      {d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ""}
                    </strong>
                    <span className="text-xs text-muted-foreground">{meta}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone={st.tone} className="text-[11px]">{st.label}</Pill>
                    {s.record && (
                      <span className="text-[11px] text-muted-foreground">
                        {s.record.is_verified ? "Verified" : "Pending approval"}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ListCard>
        )}
      </section>
    </div>
  );
};

export default StudentAttendance;
