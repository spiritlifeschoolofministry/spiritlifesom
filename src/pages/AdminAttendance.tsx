import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { downloadCSV } from "@/lib/csv-export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  Download,
  Plus,
  Edit2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const todayDateString = () => new Date().toISOString().split("T")[0];

/** Students below this percentage are surfaced by the Low Attendance alert. */
const LOW_ATTENDANCE_THRESHOLD = 75;

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
  cohort_id: string | null;
  cohort_name: string;
  is_verified?: boolean | null;
}

interface StudentStat {
  student_id: string;
  name: string;
  cohort_id: string;
  cohort_name: string;
  total_classes: number;
  verified_present: number;
  late_count: number;
  absent_count: number;
  attendance_pct: number;
}

/** Raw rows kept in state so statistics can be recomputed over a date range
 *  without refetching. */
interface RawStudent {
  id: string;
  cohort_id: string;
  name: string;
  cohort_name: string;
}
interface RawSession {
  id: string;
  cohort_id: string;
  date: string;
}
interface RawAttendance {
  student_id: string;
  schedule_id: string | null;
  status: string;
  is_verified: boolean;
}

interface AttendanceHistoryRow {
  id: string;
  marked_at: string | null;
  status: string;
  is_verified: boolean;
}

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case "Present":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    case "Absent":
      return "bg-red-100 text-red-700 border border-red-200";
    case "Late":
      return "bg-amber-100 text-amber-700 border border-amber-200";
    case "Excused":
      return "bg-blue-100 text-blue-700 border border-blue-200";
    default:
      return "bg-gray-100 text-gray-700 border border-gray-200";
  }
};

const formatAttendanceDate = (dateString: string | null) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return (
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
};

const AttendanceRecordRow = ({
  record,
  onSave,
  onDelete,
}: {
  record: AttendanceHistoryRow;
  onSave: (row: AttendanceHistoryRow) => Promise<void>;
  onDelete: (row: AttendanceHistoryRow) => Promise<void>;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState(record.status);
  const [editVerified, setEditVerified] = useState(record.is_verified);

  useEffect(() => {
    setEditStatus(record.status);
    setEditVerified(record.is_verified);
  }, [record.status, record.is_verified]);

  const handleSave = async () => {
    await onSave({ ...record, status: editStatus, is_verified: editVerified });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditStatus(record.status);
    setEditVerified(record.is_verified);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="min-w-[180px] text-sm text-muted-foreground">{formatAttendanceDate(record.marked_at)}</div>
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            className="h-9 rounded-md border border-input px-2 text-sm"
          >
            <option>Present</option>
            <option>Absent</option>
            <option>Late</option>
            <option>Excused</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={editVerified} onCheckedChange={(checked) => setEditVerified(Boolean(checked))} />
            Verified
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" className="gap-1" onClick={handleSave}>
              <CheckCircle className="h-4 w-4" /> Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 hover:bg-primary/5 transition-colors">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[180px] text-sm text-muted-foreground">{formatAttendanceDate(record.marked_at)}</div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(record.status)}`}>
          {record.status}
        </span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${record.is_verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {record.is_verified ? "✓ Verified" : "Pending"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="gap-1">
            <Edit2 className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-1"
            onClick={() => onDelete(record)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

const AdminAttendance = () => {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [rawStudents, setRawStudents] = useState<RawStudent[]>([]);
  const [rawSessions, setRawSessions] = useState<RawSession[]>([]);
  const [rawAttendance, setRawAttendance] = useState<RawAttendance[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [todayTurnout, setTodayTurnout] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statsCohortFilter, setStatsCohortFilter] = useState("all");
  const [statsFrom, setStatsFrom] = useState("");
  const [statsTo, setStatsTo] = useState("");
  const [belowThresholdOnly, setBelowThresholdOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [queueCohortFilter, setQueueCohortFilter] = useState("all");
  const [queueDate, setQueueDate] = useState("");
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
          late_after: current[cohortId]?.late_after ?? "",
        };
      } else {
        current[cohortId] = { ...current[cohortId], enabled: false, start_time: current[cohortId]?.start_time || "09:00", end_time: current[cohortId]?.end_time || "12:00", late_after: current[cohortId]?.late_after ?? "" };
      }
      await saveClassToday(current);

      // Ensure a schedule entry exists for THIS cohort when enabling. Sessions are
      // per-cohort: two cohorts meeting the same day are two separate sessions.
      if (enabled) {
        const today = todayDateString();
        const { data: existing } = await supabase
          .from("schedule")
          .select("id")
          .eq("date", today)
          .eq("cohort_id", cohortId)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("schedule").insert({
            date: today,
            cohort_id: cohortId,
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
      current[cohortId] = { enabled: false, start_time: "09:00", end_time: "12:00", late_after: "" };
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
        cohort_id: null as string | null,
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
        .select("id, cohort_id, profiles(first_name, last_name), cohorts(name)")
        .in("id", studentIds);
      const students = (studentsData || []) as Array<{
        id: string;
        cohort_id: string | null;
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
          cohort_id: s?.cohort_id ?? null,
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
      const today = todayDateString();

      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select("id, cohort_id, profiles(first_name, last_name), cohorts(name)")
        .eq("is_staff_preview", false)
        .not("cohort_id", "is", null);

      if (studentsError) throw studentsError;

      const students = (studentsData || []) as Array<{
        id: string;
        cohort_id: string;
        cohorts: { name: string } | null;
        profiles: { first_name: string; last_name: string } | null;
      }>;

      // Denominator: class sessions each cohort has actually held to date. Rows with
      // no cohort_id, or flagged counts_for_attendance = false (graduations, breaks,
      // the untracked 2025 curriculum), count for nobody.
      const { data: sessionData, error: sessionError } = await supabase
        .from("schedule")
        .select("id, cohort_id, date")
        .not("cohort_id", "is", null)
        .eq("counts_for_attendance", true)
        .lte("date", today);

      if (sessionError) throw sessionError;

      const { data: attData, error: attError } = await supabase
        .from("attendance")
        .select("student_id, schedule_id, status, is_verified");

      if (attError) throw attError;

      setRawStudents(
        students.map((s) => ({
          id: s.id,
          cohort_id: s.cohort_id,
          name: s.profiles
            ? `${s.profiles.first_name || ""} ${s.profiles.last_name || ""}`.trim()
            : "—",
          cohort_name: (s.cohorts as { name?: string })?.name ?? "—",
        }))
      );
      setRawSessions((sessionData || []) as RawSession[]);
      setRawAttendance((attData || []) as RawAttendance[]);
    } catch (err) {
      console.error("[AdminAttendance] Stats error:", err);
      toast.error("Failed to load student statistics");
    }
  }, []);

  // Statistics are derived, not fetched, so the date range can be changed without a
  // round trip. An empty range means "everything to date".
  const stats: StudentStat[] = useMemo(() => {
    const inRange = rawSessions.filter(
      (s) => (!statsFrom || s.date >= statsFrom) && (!statsTo || s.date <= statsTo)
    );

    const sessionsHeldByCohort = new Map<string, number>();
    const cohortBySessionId = new Map<string, string>();
    for (const s of inRange) {
      cohortBySessionId.set(s.id, s.cohort_id);
      sessionsHeldByCohort.set(s.cohort_id, (sessionsHeldByCohort.get(s.cohort_id) || 0) + 1);
    }

    // Numerator: verified Present/Late, restricted to the same counted sessions that
    // form the denominator, so a student can never exceed 100%.
    const presentByStudent = new Map<string, number>();
    const lateByStudent = new Map<string, number>();
    for (const a of rawAttendance) {
      if (!a.schedule_id || !cohortBySessionId.has(a.schedule_id)) continue;
      if (!a.is_verified) continue;
      const status = (a.status || "").toUpperCase();
      if (status !== "PRESENT" && status !== "LATE") continue;
      presentByStudent.set(a.student_id, (presentByStudent.get(a.student_id) || 0) + 1);
      if (status === "LATE") lateByStudent.set(a.student_id, (lateByStudent.get(a.student_id) || 0) + 1);
    }

    return rawStudents.map((s) => {
      const total = sessionsHeldByCohort.get(s.cohort_id) || 0;
      const present = presentByStudent.get(s.id) || 0;
      return {
        student_id: s.id,
        name: s.name,
        cohort_id: s.cohort_id,
        cohort_name: s.cohort_name,
        total_classes: total,
        verified_present: present,
        late_count: lateByStudent.get(s.id) || 0,
        // Absence is derived: a counted session with no verified attendance.
        absent_count: Math.max(0, total - present),
        attendance_pct: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    });
  }, [rawStudents, rawSessions, rawAttendance, statsFrom, statsTo]);

  const lowAttendanceCount = useMemo(
    () => stats.filter((r) => r.total_classes > 0 && r.attendance_pct < LOW_ATTENDANCE_THRESHOLD).length,
    [stats]
  );

  // Exports exactly what the statistics table is showing, so the CSV matches the
  // screen. handleExportAllAttendance remains the raw, unfiltered record dump.
  const handleExportFilteredStats = () => {
    if (filteredStats.length === 0) {
      toast.error("No students match the current filters");
      return;
    }
    const period = statsFrom || statsTo ? `${statsFrom || "start"}_to_${statsTo || todayDateString()}` : "to_date";
    const rows = filteredStats.map((s) => ({
      "Student Name": s.name,
      "Cohort": s.cohort_name,
      "Classes Held": s.total_classes,
      "Attended (Verified)": s.verified_present,
      "Late": s.late_count,
      "Missed": s.absent_count,
      "Attendance %": s.attendance_pct,
    }));
    downloadCSV(rows, `attendance_summary_${period}`);
  };

  const handleExportAllAttendance = async () => {
    try {
      toast.info("Preparing attendance export...");
      const { data, error } = await supabase
        .from("attendance")
        .select("id, student_id, status, is_verified, marked_at, check_in_time, students(profiles(first_name, middle_name, last_name), cohorts(name))")
        .order("marked_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) { toast.error("No attendance records"); return; }
      const rows = (data as any[]).map((a) => ({
        "Student Name": [a.students?.profiles?.first_name, a.students?.profiles?.middle_name, a.students?.profiles?.last_name].filter(Boolean).join(" "),
        "Cohort": a.students?.cohorts?.name || "",
        "Status": a.status || "",
        "Verified": a.is_verified ? "Yes" : "No",
        "Date": a.marked_at ? new Date(a.marked_at).toLocaleDateString() : "",
        "Time": a.marked_at ? new Date(a.marked_at).toLocaleTimeString() : "",
      }));
      downloadCSV(rows, "all_attendance");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export attendance");
    }
  };

  const handleExportStudentAttendance = async (studentId: string, studentName: string) => {
    try {
      toast.info(`Exporting attendance for ${studentName}...`);
      const { data, error } = await supabase
        .from("attendance")
        .select("id, status, is_verified, marked_at, check_in_time")
        .eq("student_id", studentId)
        .order("marked_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) { toast.error("No records for this student"); return; }
      const rows = data.map((a) => ({
        "Status": a.status || "",
        "Verified": a.is_verified ? "Yes" : "No",
        "Date": a.marked_at ? new Date(a.marked_at).toLocaleDateString() : "",
        "Time": a.marked_at ? new Date(a.marked_at).toLocaleTimeString() : "",
      }));
      downloadCSV(rows, `attendance_${studentName.replace(/\s+/g, "_")}`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export student attendance");
    }
  };

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

  // Scoped to the filtered queue — bulk-verifying another cohort by accident is
  // not recoverable without hunting down the individual records.
  const verifyAllPending = async () => {
    if (filteredPending.length === 0) return;
    setBulkVerifying(true);
    try {
      const ids = filteredPending.map((p) => p.id);
      const { error } = await supabase
        .from("attendance")
        .update({ is_verified: true })
        .in("id", ids);
      if (error) throw error;
      toast.success(`Verified ${ids.length} record(s)`);
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
      // Find this cohort's session for the date, or auto-create one.
      let scheduleId: string | null = null;
      const { data: cohortSchedule } = await supabase
        .from("schedule")
        .select("id")
        .eq("date", newDate)
        .eq("cohort_id", detailCohortId)
        .limit(1);
      if (cohortSchedule && cohortSchedule.length > 0) {
        scheduleId = cohortSchedule[0].id;
      }
      // Auto-create a schedule entry if none exists
      if (!scheduleId) {
        const dayName = new Date(`${newDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
        const { data: created, error: createErr } = await supabase
          .from("schedule")
          .insert({ date: newDate, cohort_id: detailCohortId, activity_type: "Lecture", description: "Admin-created session", day: dayName })
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
          marked_by: user?.id ?? null,
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

  const filteredStats = useMemo(
    () =>
      stats.filter((s) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q || s.name.toLowerCase().includes(q) || s.cohort_name.toLowerCase().includes(q);
        // Match on id, not name — two cohorts sharing a name would otherwise collide.
        const matchesCohort = statsCohortFilter === "all" || s.cohort_id === statsCohortFilter;
        const matchesThreshold =
          !belowThresholdOnly || (s.total_classes > 0 && s.attendance_pct < LOW_ATTENDANCE_THRESHOLD);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "present" && s.verified_present - s.late_count > 0) ||
          (statusFilter === "late" && s.late_count > 0) ||
          (statusFilter === "absent" && s.absent_count > 0);
        return matchesSearch && matchesCohort && matchesThreshold && matchesStatus;
      }),
    [stats, search, statsCohortFilter, belowThresholdOnly, statusFilter]
  );

  const filteredPending = useMemo(
    () =>
      pending.filter((p) => {
        const matchesCohort = queueCohortFilter === "all" || p.cohort_id === queueCohortFilter;
        const matchesDate =
          !queueDate || (p.marked_at ? p.marked_at.slice(0, 10) === queueDate : false);
        return matchesCohort && matchesDate;
      }),
    [pending, queueCohortFilter, queueDate]
  );

  const statsFiltersActive =
    Boolean(search.trim()) || statsCohortFilter !== "all" || belowThresholdOnly ||
    statusFilter !== "all" || Boolean(statsFrom) || Boolean(statsTo);

  const clearStatsFilters = () => {
    setSearch("");
    setStatsCohortFilter("all");
    setBelowThresholdOnly(false);
    setStatusFilter("all");
    setStatsFrom("");
    setStatsTo("");
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Attendance Command Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Verify check-ins and view student attendance statistics.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportAllAttendance} className="gap-2 self-start">
          <Download className="h-4 w-4" /> Export Everything
        </Button>
      </div>

      {/* Per-Cohort Class Toggles */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Power className={`w-4 h-4 ${anyEnabled ? 'text-emerald-600' : 'text-muted-foreground'}`} />
            Class Today — Per Cohort
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Enable class and set the check-in window for each cohort. Set "Late after" each
            session, measured in Nigerian time on the server. Leave it blank and nobody is
            marked late - which is the right choice if you open the register when class starts.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {cohorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active cohorts found.</p>
          ) : (
            cohorts.map((cohort) => {
              const toggle = cohortToggles[cohort.id] || { enabled: false, start_time: "09:00", end_time: "12:00", late_after: "" };
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
                          <span className="text-muted-foreground/70">(blank = nobody late)</span>
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
        <Card
          role="button"
          tabIndex={0}
          aria-pressed={belowThresholdOnly}
          onClick={() => setBelowThresholdOnly((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setBelowThresholdOnly((v) => !v);
            }
          }}
          className={`shadow-[var(--shadow-card)] cursor-pointer transition-colors hover:bg-red-50/50 ${
            belowThresholdOnly ? "border-red-400 ring-2 ring-red-200 bg-red-50/50" : "border-border"
          }`}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Low Attendance Alert</p>
              <p className="text-2xl font-bold text-foreground">
                {lowAttendanceCount}
                <span className="text-sm font-normal text-muted-foreground"> below {LOW_ATTENDANCE_THRESHOLD}%</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {belowThresholdOnly ? "Filtering — click to clear" : "Click to filter the table"}
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
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">
              Verification Queue
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filteredPending.length === pending.length
                  ? `${pending.length} pending`
                  : `${filteredPending.length} of ${pending.length} pending`}
              </span>
            </CardTitle>
            {filteredPending.length > 0 && (
              <Button
                size="sm"
                onClick={verifyAllPending}
                disabled={bulkVerifying}
                className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
              >
                {bulkVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-1" />
                )}
                Verify {filteredPending.length === pending.length ? "All" : `These ${filteredPending.length}`}
              </Button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="border border-input bg-background rounded-md px-3 py-2 text-sm"
              value={queueCohortFilter}
              onChange={(e) => setQueueCohortFilter(e.target.value)}
              aria-label="Filter queue by cohort"
            >
              <option value="all">All Cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Input
              type="date"
              value={queueDate}
              onChange={(e) => setQueueDate(e.target.value)}
              className="sm:max-w-[180px]"
              aria-label="Filter queue by date"
            />
            {(queueCohortFilter !== "all" || queueDate) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setQueueCohortFilter("all"); setQueueDate(""); }}
                className="self-start"
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredPending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {pending.length === 0 ? "No pending approvals." : "No pending approvals match these filters."}
            </p>
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
                  {filteredPending.map((row) => (
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Student Statistics
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filteredStats.length === stats.length
                  ? `${stats.length} students`
                  : `${filteredStats.length} of ${stats.length} students`}
              </span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportFilteredStats} className="gap-2">
              <Download className="h-4 w-4" /> Export This View
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mt-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
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
              aria-label="Filter by cohort"
            >
              <option value="all">All Cohorts</option>
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              className="border border-input bg-background rounded-md px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">Any Status</option>
              <option value="present">Has Present</option>
              <option value="late">Has Late</option>
              <option value="absent">Has Missed Class</option>
            </select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={statsFrom}
                max={statsTo || undefined}
                onChange={(e) => setStatsFrom(e.target.value)}
                className="max-w-[160px]"
                aria-label="Statistics from date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={statsTo}
                min={statsFrom || undefined}
                onChange={(e) => setStatsTo(e.target.value)}
                className="max-w-[160px]"
                aria-label="Statistics to date"
              />
            </div>
            {statsFiltersActive && (
              <Button size="sm" variant="ghost" onClick={clearStatsFilters}>Clear filters</Button>
            )}
          </div>
          {(statsFrom || statsTo) && (
            <p className="text-xs text-muted-foreground mt-2">
              Percentages are recalculated over the selected period — "Classes Held" counts only
              sessions in range.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Classes Held</TableHead>
                  <TableHead>Attended</TableHead>
                  <TableHead>Late</TableHead>
                  <TableHead>Missed</TableHead>
                  <TableHead>Attendance %</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                      <TableCell className={s.late_count > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                        {s.late_count}
                      </TableCell>
                      <TableCell className={s.absent_count > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                        {s.absent_count}
                      </TableCell>
                      <TableCell>
                        <span className={pctColor(s.attendance_pct)}>{s.attendance_pct}%</span>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleExportStudentAttendance(s.student_id, s.name)}
                          className="gap-1"
                        >
                          <Download className="h-3.5 w-3.5" /> Export
                        </Button>
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attendance Records - {detailStudentName}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              View and manage all attendance records for this student
            </p>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Plus className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Add New Record</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                      <Input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                      <select
                        className="h-10 w-full rounded-md border border-input px-3 text-sm"
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                      >
                        <option>Present</option>
                        <option>Absent</option>
                        <option>Late</option>
                        <option>Excused</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2">
                      <Checkbox checked={newVerified} onCheckedChange={(checked) => setNewVerified(Boolean(checked))} />
                      <span className="text-sm">Mark as verified</span>
                    </label>
                    <Button onClick={addHistoryRow} className="gap-2">
                      <Plus className="h-4 w-4" /> Add Record
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    New records require an existing schedule entry for the selected date.
                  </p>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-sm font-semibold mb-3">Attendance History</h3>
                {detailHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
                    No attendance records found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailHistory.map((row) => (
                      <AttendanceRecordRow
                        key={row.id}
                        record={row}
                        onSave={saveHistoryRow}
                        onDelete={deleteHistoryRow}
                      />
                    ))}
                  </div>
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
