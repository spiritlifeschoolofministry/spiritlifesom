import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/csv-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  CalendarCheck,
  AlertTriangle,
  Users,
  CheckCircle,
  XCircle,
  Search,
  Loader2,
  Power,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const todayDateString = () => new Date().toISOString().split("T")[0];

interface CohortToggle {
  enabled: boolean;
  start_time: string; // HH:mm
  end_time: string;   // HH:mm
  late_after: string;  // HH:mm — after this time, check-in counts as late
}

interface ClassTodayValue {
  date: string;
  cohorts: Record<string, CohortToggle>;
}

interface CohortInfo {
  id: string;
  name: string;
}

interface PendingRow {
  id: string;
  marked_at: string | null;
  student_id: string;
  student_name: string;
  cohort_name: string;
  is_verified?: boolean | null;
}

interface StudentStat {
  student_id: string;
  name: string;
  cohort_name: string;
  total_classes: number;
  verified_present: number;
  attendance_pct: number;
}

interface AttendanceHistoryRow {
  id: string;
  marked_at: string | null;
  status: string;
  is_verified: boolean;
}

const AdminAttendance = () => {
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [stats, setStats] = useState<StudentStat[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [lowAttendanceCount, setLowAttendanceCount] = useState(0);
  const [todayTurnout, setTodayTurnout] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statsCohortFilter, setStatsCohortFilter] = useState("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [bulkVerifying, setBulkVerifying] = useState(false);

  // Per-cohort toggles
  const [cohorts, setCohorts] = useState<CohortInfo[]>([]);
  const [cohortToggles, setCohortToggles] = useState<Record<string, CohortToggle>>({});
  const [togglingCohort, setTogglingCohort] = useState<string | null>(null);

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailStudentName, setDetailStudentName] = useState<string>("");
  const [detailCohortId, setDetailCohortId] = useState<string | null>(null);
  const [detailHistory, setDetailHistory] = useState<AttendanceHistoryRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newDate, setNewDate] = useState<string>("");
  const [newStatus, setNewStatus] = useState<string>("Present");
  const [newVerified, setNewVerified] = useState<boolean>(false);

  const loadCohorts = useCallback(async () => {
    const { data } = await supabase
      .from("cohorts")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setCohorts((data || []) as CohortInfo[]);
  }, []);

  const loadClassTodaySetting = useCallback(async () => {
    try {
      const today = todayDateString();
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "class_today")
        .maybeSingle();

      if (data?.value) {
        const val = data.value as unknown as ClassTodayValue;
        if (val.date === today && val.cohorts) {
          setCohortToggles(val.cohorts);
        } else {
          setCohortToggles({});
        }
      } else {
        setCohortToggles({});
      }
    } catch (err) {
      console.error("[AdminAttendance] Class today setting error:", err);
    }
  }, []);

  const saveClassToday = async (newToggles: Record<string, CohortToggle>) => {
    const today = todayDateString();
    const newValue: ClassTodayValue = { date: today, cohorts: newToggles };
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { key: "class_today", value: newValue as unknown as Json, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw error;
  };

  const toggleCohortClass = async (cohortId: string, enabled: boolean) => {
    setTogglingCohort(cohortId);
    try {
      const current = { ...cohortToggles };
      if (enabled) {
        current[cohortId] = {
          enabled: true,
          start_time: current[cohortId]?.start_time || "09:00",
          end_time: current[cohortId]?.end_time || "12:00",
          late_after: current[cohortId]?.late_after || "09:15",
        };
      } else {
        current[cohortId] = { ...current[cohortId], enabled: false, start_time: current[cohortId]?.start_time || "09:00", end_time: current[cohortId]?.end_time || "12:00", late_after: current[cohortId]?.late_after || "09:15" };
      }
      await saveClassToday(current);

      // Ensure schedule entry exists when enabling
      if (enabled) {
        const today = todayDateString();
        const { data: existing } = await supabase
          .from("schedule")
          .select("id")
          .eq("date", today)
          .eq("activity_type", "Lecture")
          .is("course_id", null)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("schedule").insert({
            date: today,
            activity_type: "Lecture",
            description: "Class session",
            day: new Date().toLocaleDateString("en-US", { weekday: "long" }),
          });
        }
      }

      setCohortToggles(current);
      const cohortName = cohorts.find(c => c.id === cohortId)?.name || "Cohort";
      toast.success(enabled ? `Class enabled for ${cohortName}` : `Class disabled for ${cohortName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to toggle class";
      toast.error(msg);
    } finally {
      setTogglingCohort(null);
    }
  };

  const updateCohortTime = async (cohortId: string, field: "start_time" | "end_time" | "late_after", value: string) => {
    const current = { ...cohortToggles };
    if (!current[cohortId]) {
      current[cohortId] = { enabled: false, start_time: "09:00", end_time: "12:00", late_after: "09:15" };
    }
    current[cohortId] = { ...current[cohortId], [field]: value };
    setCohortToggles(current);
    try {
      await saveClassToday(current);
    } catch (err) {
      console.error("Failed to save time:", err);
    }
  };

  const loadSummary = useCallback(async () => {
    try {
      const today = todayDateString();
      const [pendingCountRes, todayCountRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("is_verified", false),
        supabase
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .gte("marked_at", `${today}T00:00:00`)
          .lt("marked_at", `${today}T23:59:59.999Z`),
      ]);
      setTotalPending(pendingCountRes.count ?? 0);
      setTodayTurnout(todayCountRes.count ?? 0);
    } catch (err) {
      console.error("[AdminAttendance] Summary load error:", err);
    }
  }, []);

  const loadPendingQueue = useCallback(async () => {
    try {
      const { data: attendanceData, error: attError } = await supabase
        .from("attendance")
        .select("id, marked_at, student_id, is_verified, check_in_time")
        .eq("is_verified", false)
        .order("marked_at", { ascending: false });

      if (attError) throw attError;

      const list = (attendanceData || []).map((a) => ({
        id: a.id,
        marked_at: a.marked_at,
        student_id: a.student_id,
        student_name: "",
        cohort_name: "",
        is_verified: a.is_verified,
      }));
      const studentIds = [...new Set(list.map((x) => x.student_id))];
      if (studentIds.length === 0) {
        setPending([]);
        return;
      }
      const { data: studentsData } = await supabase
        .from("students")
        .select("id, profiles(first_name, last_name), cohorts(name)")
        .in("id", studentIds);
      const students = (studentsData || []) as Array<{
        id: string;
        cohorts: { name: string } | null;
        profiles: { first_name: string; last_name: string } | null;
      }>;
      const byId = new Map(students.map((s) => [s.id, s]));
      const enriched = list.map((p) => {
        const s = byId.get(p.student_id);
        return {
          ...p,
          student_name: s?.profiles
            ? `${s.profiles.first_name || ""} ${s.profiles.last_name || ""}`.trim()
            : "—",
          cohort_name: (s?.cohorts as { name?: string })?.name ?? "—",
        };
      });
      setPending(enriched);
    } catch (err) {
      console.error("[AdminAttendance] Pending queue error:", err);
      toast.error("Failed to load verification queue");
    }
  }, []);

  const loadStudentStats = useCallback(async () => {
    try {
      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select("id, profiles(first_name, last_name), cohorts(name)")
        .not("cohort_id", "is", null);

      if (studentsError) throw studentsError;

      const students = (studentsData || []) as Array<{
        id: string;
        cohorts: { name: string } | null;
        profiles: { first_name: string; last_name: string } | null;
      }>;

      const { data: attData, error: attError } = await supabase
        .from("attendance")
        .select("id, student_id, status");

      if (attError) throw attError;
      const attList = attData || [];

      const presentByStudent = new Map<string, number>();
      const totalByStudent = new Map<string, number>();
      for (const a of attList) {
        const sid = (a as { student_id: string }).student_id;
        totalByStudent.set(sid, (totalByStudent.get(sid) || 0) + 1);
        if ((a as { status?: string }).status?.toUpperCase() === "PRESENT") {
          presentByStudent.set(sid, (presentByStudent.get(sid) || 0) + 1);
        }
      }

      const result: StudentStat[] = students.map((s) => {
        const total = totalByStudent.get(s.id) || 0;
        const present = presentByStudent.get(s.id) || 0;
        const pct = total > 0 ? Math.round((present / total) * 100) : 0;
        return {
          student_id: s.id,
          name: s.profiles
            ? `${s.profiles.first_name || ""} ${s.profiles.last_name || ""}`.trim()
            : "—",
          cohort_name: (s.cohorts as { name?: string })?.name ?? "—",
          total_classes: total,
          verified_present: present,
          attendance_pct: pct,
        };
      });

      setStats(result);
      const below75 = result.filter((r) => r.attendance_pct < 75).length;
      setLowAttendanceCount(below75);
    } catch (err) {
      console.error("[AdminAttendance] Stats error:", err);
      toast.error("Failed to load student statistics");
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCohorts(), loadClassTodaySetting(), loadSummary(), loadPendingQueue(), loadStudentStats()]);
    setLoading(false);
  }, [loadCohorts, loadClassTodaySetting, loadSummary, loadPendingQueue, loadStudentStats]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const verifyOne = async (attendanceId: string) => {
    setVerifyingId(attendanceId);
    try {
      const { error } = await supabase
        .from("attendance")
        .update({ is_verified: true })
        .eq("id", attendanceId);
      if (error) throw error;
      toast.success("Attendance verified");
      await loadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verify failed";
      toast.error(msg);
    } finally {
      setVerifyingId(null);
    }
  };

  const declineOne = async (attendanceId: string) => {
    if (!confirm("Remove this attendance record? This cannot be undone.")) return;
    setVerifyingId(attendanceId);
    try {
      const { error } = await supabase.from("attendance").delete().eq("id", attendanceId);
      if (error) throw error;
      toast.success("Record removed");
      await loadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    } finally {
      setVerifyingId(null);
    }
  };

  const verifyAllPending = async () => {
    if (pending.length === 0) return;
    setBulkVerifying(true);
    try {
      const ids = pending.map((p) => p.id);
      const { error } = await supabase
        .from("attendance")
        .update({ is_verified: true })
        .in("id", ids);
      if (error) throw error;
      toast.success(`Verified ${pending.length} record(s)`);
      await loadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bulk verify failed";
      toast.error(msg);
    } finally {
      setBulkVerifying(false);
    }
  };

  const openDetail = async (studentId: string) => {
    setDetailStudentId(studentId);
    setDetailLoading(true);
    setDetailHistory([]);
    setNewDate("");
    setNewStatus("Present");
    setNewVerified(false);
    try {
      const [{ data: studentData, error: studentError }, { data, error }] =
        await Promise.all([
          supabase
            .from("students")
            .select("cohort_id, profiles(first_name, last_name)")
            .eq("id", studentId)
            .maybeSingle(),
          supabase
            .from("attendance")
            .select("id, marked_at, status, is_verified")
            .eq("student_id", studentId)
            .order("marked_at", { ascending: false }),
        ]);

      if (studentError) throw studentError;
      const fullName = studentData?.profiles
        ? `${studentData.profiles.first_name || ""} ${studentData.profiles.last_name || ""}`.trim()
        : "";
      setDetailStudentName(fullName || "Student");
      setDetailCohortId(studentData?.cohort_id ?? null);

      if (error) throw error;
      setDetailHistory((data as AttendanceHistoryRow[]) || []);
    } catch (err) {
      console.error("[AdminAttendance] Detail load error:", err);
      toast.error("Failed to load history");
    } finally {
      setDetailLoading(false);
    }
  };

  const updateHistoryRow = (id: string, updater: (row: AttendanceHistoryRow) => AttendanceHistoryRow) => {
    setDetailHistory((prev) => prev.map((row) => (row.id === id ? updater(row) : row)));
  };

  const saveHistoryRow = async (row: AttendanceHistoryRow) => {
    try {
      const { error } = await supabase
        .from("attendance")
        .update({ status: row.status, is_verified: row.is_verified })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Attendance record updated");
      await loadAll();
      if (detailStudentId) await openDetail(detailStudentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update record";
      toast.error(msg);
    }
  };

  const deleteHistoryRow = async (row: AttendanceHistoryRow) => {
    if (!confirm("Delete this attendance record? This cannot be undone.")) return;
    try {
      const { error } = await supabase.from("attendance").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Attendance record deleted");
      await loadAll();
      if (detailStudentId) await openDetail(detailStudentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete record";
      toast.error(msg);
    }
  };

  const addHistoryRow = async () => {
    if (!detailStudentId) return;
    if (!newDate) {
      toast.error("Please select a date for the new record.");
      return;
    }
    if (!detailCohortId) {
      toast.error("Student cohort not found for schedule lookup.");
      return;
    }
    try {
      // Try to find existing schedule, or auto-create one
      let scheduleId: string | null = null;
      const { data: cohortSchedule } = await supabase
        .from("schedule")
        .select("id, date, courses!inner(cohort_id)")
        .eq("date", newDate)
        .eq("courses.cohort_id", detailCohortId)
        .limit(1);
      if (cohortSchedule && cohortSchedule.length > 0) {
        scheduleId = (cohortSchedule[0] as { id: string }).id;
      } else {
        const { data: genericSchedule } = await supabase
          .from("schedule")
          .select("id")
          .eq("date", newDate)
          .is("course_id", null)
          .limit(1);
        if (genericSchedule && genericSchedule.length > 0) {
          scheduleId = genericSchedule[0].id;
        }
      }
      // Auto-create a schedule entry if none exists
      if (!scheduleId) {
        const dayName = new Date(`${newDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
        const { data: created, error: createErr } = await supabase
          .from("schedule")
          .insert({ date: newDate, activity_type: "Lecture", description: "Admin-created session", day: dayName })
          .select("id")
          .single();
        if (createErr) throw createErr;
        scheduleId = created.id;
      }
      const checkInTimestamp = new Date(`${newDate}T00:00:00`).toISOString();
      const { error: insertError } = await supabase
        .from("attendance")
        .upsert({
          student_id: detailStudentId,
          schedule_id: scheduleId,
          status: newStatus,
          check_in_time: checkInTimestamp,
          marked_at: checkInTimestamp,
          is_verified: newVerified,
        }, { onConflict: "student_id,schedule_id" });
      if (insertError) throw insertError;
      toast.success("Attendance record added");
      setNewDate("");
      setNewStatus("Present");
      setNewVerified(false);
      await loadAll();
      await openDetail(detailStudentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add record";
      toast.error(msg);
    }
  };

  const filteredStats = stats.filter(
    (s) => {
      const matchesSearch = !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.cohort_name.toLowerCase().includes(search.toLowerCase());
      const matchesCohort = statsCohortFilter === "all" || s.cohort_name === cohorts.find(c => c.id === statsCohortFilter)?.name;
      return matchesSearch && matchesCohort;
    }
  );

  const pctColor = (pct: number) => {
    if (pct < 70) return "text-red-600 font-semibold";
    if (pct <= 85) return "text-amber-600 font-semibold";
    return "text-emerald-600 font-semibold";
  };

  const anyEnabled = Object.values(cohortToggles).some(t => t.enabled);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Attendance Command Center
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Verify check-ins and view student attendance statistics.
        </p>
      </div>

      {/* Per-Cohort Class Toggles */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Power className={`w-4 h-4 ${anyEnabled ? 'text-emerald-600' : 'text-muted-foreground'}`} />
            Class Today — Per Cohort
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Enable class and set the check-in window for each cohort. Students arriving after the "Late after" time will be marked as Late.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {cohorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active cohorts found.</p>
          ) : (
            cohorts.map((cohort) => {
              const toggle = cohortToggles[cohort.id] || { enabled: false, start_time: "09:00", end_time: "12:00", late_after: "09:15" };
              const isToggling = togglingCohort === cohort.id;
              return (
                <div
                  key={cohort.id}
                  className={`rounded-lg border p-4 transition-colors ${toggle.enabled ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800' : 'border-border bg-secondary/30'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${toggle.enabled ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-muted'}`}>
                        <CalendarCheck className={`w-4 h-4 ${toggle.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">{cohort.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {toggle.enabled ? "Check-in open" : "Check-in disabled"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={toggle.enabled}
                      onCheckedChange={(checked) => toggleCohortClass(cohort.id, checked)}
                      disabled={isToggling}
                    />
                  </div>
                  {toggle.enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-12">
                      <div>
                        <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 mb-1">
                          <Clock className="w-3 h-3" /> Start Time
                        </label>
                        <Input
                          type="time"
                          value={toggle.start_time}
                          onChange={(e) => updateCohortTime(cohort.id, "start_time", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 mb-1">
                          <Clock className="w-3 h-3" /> End Time
                        </label>
                        <Input
                          type="time"
                          value={toggle.end_time}
                          onChange={(e) => updateCohortTime(cohort.id, "end_time", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 mb-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" /> Late After
                        </label>
                        <Input
                          type="time"
                          value={toggle.late_after}
                          onChange={(e) => updateCohortTime(cohort.id, "late_after", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <CalendarCheck className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Pending</p>
              <p className="text-2xl font-bold text-foreground">{totalPending}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Low Attendance Alert</p>
              <p className="text-2xl font-bold text-foreground">
                {lowAttendanceCount}
                <span className="text-sm font-normal text-muted-foreground"> below 75%</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Today's Turnout</p>
              <p className="text-2xl font-bold text-foreground">{todayTurnout}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verification Queue */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Verification Queue</CardTitle>
          {pending.length > 0 && (
            <Button
              size="sm"
              onClick={verifyAllPending}
              disabled={bulkVerifying}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {bulkVerifying ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              Verify All Pending
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pending approvals.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Cohort</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.student_name || "—"}</TableCell>
                      <TableCell>{row.cohort_name}</TableCell>
                      <TableCell>
                        {row.marked_at ? new Date(row.marked_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => verifyOne(row.id)}
                          disabled={verifyingId === row.id}
                        >
                          {verifyingId === row.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>Verify</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => declineOne(row.id)}
                          disabled={verifyingId === row.id}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Decline
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Statistics */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Student Statistics</CardTitle>
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              className="border border-input bg-background rounded-md px-3 py-2 text-sm"
              value={statsCohortFilter}
              onChange={(e) => setStatsCohortFilter(e.target.value)}
            >
              <option value="all">All Cohorts</option>
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Total Classes</TableHead>
                  <TableHead>Verified Present</TableHead>
                  <TableHead>Attendance %</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No students found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats.map((s) => (
                    <TableRow key={s.student_id}>
                      <TableCell>
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline text-left"
                          onClick={() => openDetail(s.student_id)}
                        >
                          {s.name || "—"}
                        </button>
                      </TableCell>
                      <TableCell>{s.cohort_name}</TableCell>
                      <TableCell>{s.total_classes}</TableCell>
                      <TableCell>{s.verified_present}</TableCell>
                      <TableCell>
                        <span className={pctColor(s.attendance_pct)}>{s.attendance_pct}%</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openDetail(s.student_id)}
                        >
                          Edit Records
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailStudentId} onOpenChange={() => setDetailStudentId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Attendance – {detailStudentName}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-border rounded-lg p-3 space-y-3">
                <h3 className="text-sm font-semibold">Add New Record</h3>
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <Input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="sm:w-40"
                  />
                  <select
                    className="border border-input bg-background rounded-md px-2 py-1 text-sm"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  >
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Late">Late</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs sm:text-sm">
                    <input
                      type="checkbox"
                      checked={newVerified}
                      onChange={(e) => setNewVerified(e.target.checked)}
                    />
                    Mark as verified
                  </label>
                  <Button size="sm" onClick={addHistoryRow}>Add Record</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  New records require an existing schedule entry for the selected date.
                </p>
              </div>

              <div className="space-y-2">
                {detailHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No records.</p>
                ) : (
                  detailHistory.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 md:grid-cols-[1.7fr_1.4fr_1.2fr_auto] gap-3 items-center p-3 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {row.marked_at ? new Date(row.marked_at).toLocaleString() : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Status:</span>
                        <select
                          className="border border-input bg-background rounded-md px-2 py-1 text-xs"
                          value={row.status}
                          onChange={(e) =>
                            updateHistoryRow(row.id, (r) => ({ ...r, status: e.target.value }))
                          }
                        >
                          <option value="Present">Present</option>
                          <option value="Absent">Absent</option>
                          <option value="Late">Late</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={!!row.is_verified}
                            onChange={(e) =>
                              updateHistoryRow(row.id, (r) => ({ ...r, is_verified: e.target.checked }))
                            }
                          />
                          Verified
                        </label>
                        <Badge
                          variant={row.is_verified ? "default" : "secondary"}
                          className={row.is_verified ? "bg-emerald-600" : "bg-amber-100 text-amber-800"}
                        >
                          {row.is_verified ? "Verified" : "Pending"}
                        </Badge>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => saveHistoryRow(row)}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => deleteHistoryRow(row)}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAttendance;
