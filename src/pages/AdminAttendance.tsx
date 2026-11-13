import { useCallback, useEffect, useMemo, useState } from "react";
import AttendanceHeatmap from "@/components/charts/AttendanceHeatmap";
import { shapeHeatmap } from "@/lib/attendance-heatmap";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { downloadCSV } from "@/lib/csv-export";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle,
  XCircle,
  Search,
  Loader2,
  Download,
  Plus,
  Edit2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { AdminPageHeader, InitialsBadge, KpiTile, Panel, StatusPill, type Tone } from "@/components/redesign/admin/primitives";
import { APPROVE_BUTTON, QUIET_BUTTON, REJECT_BUTTON, TONE_TEXT } from "@/components/redesign/admin/styles";

/** 44px touch targets on phones, the board's 40px from sm up. */
const TAP = "h-11 sm:h-10";
const TAP_SM = "h-11 px-3 text-[13px] sm:h-[34px]";
const SELECT_CLASS =
  "h-11 rounded-[10px] border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10";

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
  /** Present or Late, as the server stamped it at check-in. */
  status: string | null;
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
          <div className="w-full text-sm text-muted-foreground sm:w-auto sm:min-w-[180px]">{formatAttendanceDate(record.marked_at)}</div>
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
        <div className="w-full text-sm text-muted-foreground sm:w-auto sm:min-w-[180px]">{formatAttendanceDate(record.marked_at)}</div>
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
  // "+ Add record" in the header: pick a student, then the history dialog's
  // own add form does the work.
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addPickerQuery, setAddPickerQuery] = useState("");

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
        .select("id, marked_at, student_id, is_verified, check_in_time, status")
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
        status: a.status ?? null,
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
      const rows = data.map((a) => ({
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

  const heatmap = useMemo(
    () => shapeHeatmap(rawStudents, rawSessions, rawAttendance, statsCohortFilter === "all" ? null : statsCohortFilter),
    [rawStudents, rawSessions, rawAttendance, statsCohortFilter],
  );

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

  // Same bands as before: under 70 red, up to 85 amber, above that green.
  const pctTone = (pct: number): Tone => (pct < 70 ? "bad" : pct <= 85 ? "warn" : "good");

  const checkInTone = (status: string | null): { tone: Tone; label: string } => {
    const s = (status || "").toUpperCase();
    if (s === "LATE") return { tone: "warn", label: "Late" };
    if (s === "PRESENT") return { tone: "good", label: "Present" };
    return { tone: "neutral", label: status || "Checked in" };
  };

  // Average over the students the table is showing who have had a class.
  const averageBase = filteredStats.filter((s) => s.total_classes > 0);
  const averagePct =
    averageBase.length > 0
      ? Math.round(averageBase.reduce((sum, s) => sum + s.attendance_pct, 0) / averageBase.length)
      : null;

  const pickerMatches = rawStudents
    .filter((s) => {
      const q = addPickerQuery.trim().toLowerCase();
      return !q || s.name.toLowerCase().includes(q) || s.cohort_name.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);

  const queueFiltered = queueCohortFilter !== "all" || Boolean(queueDate);

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
    <div className="space-y-5">
      <AdminPageHeader
        section="Teaching"
        title="Attendance"
        actions={
          <>
            <Button type="button" variant="outline" onClick={handleExportFilteredStats} className={cn(TAP, QUIET_BUTTON, "rounded-[10px] font-semibold")}>
              <Download className="h-4 w-4" aria-hidden="true" /> Export this view
            </Button>
            <Button type="button" variant="outline" onClick={handleExportAllAttendance} className={cn(TAP, QUIET_BUTTON, "rounded-[10px] font-semibold")}>
              <Download className="h-4 w-4" aria-hidden="true" /> Export everything
            </Button>
            <Button
              type="button"
              onClick={() => { setAddPickerQuery(""); setAddPickerOpen(true); }}
              className={cn(TAP, "rounded-[10px] font-bold")}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add record
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-stretch gap-5">
        {/* Per-cohort class switches */}
        <section
          aria-labelledby="class-today-title"
          className="flex min-w-0 flex-[3_1_560px] flex-col gap-3.5 rounded-[18px] border border-border bg-card px-5 py-[18px]"
        >
          <div className="flex flex-col gap-0.5">
            <h2 id="class-today-title" className="text-[17px] font-bold text-foreground">Class today, per cohort</h2>
            <p className="text-[13px] text-muted-foreground">
              Turn a cohort on to let its students check in. Check-ins after "Late after" are marked Late by the
              server, in Nigerian (Lagos) time. Leave it blank and nobody is marked late, which is right if you
              open the register when class starts.
            </p>
          </div>
          {cohorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active cohorts found.</p>
          ) : (
            cohorts.map((cohort) => {
              const toggle = cohortToggles[cohort.id] || { enabled: false, start_time: "09:00", end_time: "12:00", late_after: "" };
              const isToggling = togglingCohort === cohort.id;
              const fieldId = (field: string) => `class-${cohort.id}-${field}`;
              return (
                <div
                  key={cohort.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3.5 rounded-2xl border px-3.5 py-3 transition-colors",
                    toggle.enabled ? "border-primary/30 bg-secondary/60" : "border-border bg-card",
                  )}
                >
                  <Switch
                    checked={toggle.enabled}
                    onCheckedChange={(checked) => toggleCohortClass(cohort.id, checked)}
                    disabled={isToggling}
                    aria-label={`Class today for ${cohort.name}`}
                  />
                  <span className="flex min-w-0 flex-[1_1_160px] flex-col gap-0.5">
                    <strong className="text-[15px] font-semibold text-foreground">{cohort.name}</strong>
                    <span className="text-xs text-muted-foreground">
                      {isToggling
                        ? "Saving…"
                        : toggle.enabled
                          ? `Check-in open ${toggle.start_time} – ${toggle.end_time}`
                          : "No class today"}
                    </span>
                  </span>
                  {toggle.enabled && (
                    <div className="flex flex-wrap gap-3">
                      {([
                        ["start_time", "Opens"],
                        ["end_time", "Closes"],
                        ["late_after", "Late after"],
                      ] as const).map(([field, label]) => (
                        <div key={field} className="flex flex-col gap-1">
                          <label htmlFor={fieldId(field)} className="text-xs font-semibold text-muted-foreground">
                            {label}
                            {field === "late_after" && <span className="sr-only"> (blank means nobody is late)</span>}
                          </label>
                          <Input
                            id={fieldId(field)}
                            type="time"
                            value={toggle[field]}
                            onChange={(e) => updateCohortTime(cohort.id, field, e.target.value)}
                            className="h-11 w-[8.5rem] rounded-[10px] text-sm sm:h-[38px]"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        <div className="grid min-w-0 flex-[2_1_320px] grid-cols-2 gap-3">
          <KpiTile label="Today's turnout" value={todayTurnout} note="Check-ins today" tone="good" />
          <KpiTile label="Waiting to verify" value={totalPending} note="Self check-ins" tone="warn" />
          <KpiTile
            label="Low attendance"
            value={lowAttendanceCount}
            note={belowThresholdOnly ? "Filtering the table. Click to clear" : `Students under ${LOW_ATTENDANCE_THRESHOLD}%`}
            tone="bad"
            onClick={() => setBelowThresholdOnly((v) => !v)}
            pressed={belowThresholdOnly}
          />
          <KpiTile
            label={statsCohortFilter === "all" ? "Average attendance" : "Cohort average"}
            value={averagePct === null ? "—" : `${averagePct}%`}
            note={`Across ${averageBase.length} ${averageBase.length === 1 ? "student" : "students"}`}
          />
        </div>
      </div>

      {/* Verification queue */}
      <Panel
        title={`Check-ins waiting for you · ${queueFiltered ? `${filteredPending.length} of ${pending.length}` : pending.length}`}
        titleId="checkins-title"
        actions={
          <>
            <select
              className={SELECT_CLASS}
              value={queueCohortFilter}
              onChange={(e) => setQueueCohortFilter(e.target.value)}
              aria-label="Filter check-ins by cohort"
            >
              <option value="all">All cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Input
              type="date"
              value={queueDate}
              onChange={(e) => setQueueDate(e.target.value)}
              className="h-11 w-[10.5rem] rounded-[10px] sm:h-10"
              aria-label="Filter check-ins by date"
            />
            {queueFiltered && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setQueueCohortFilter("all"); setQueueDate(""); }}
                className={TAP}
              >
                Clear
              </Button>
            )}
            {filteredPending.length > 0 && (
              <Button
                type="button"
                onClick={verifyAllPending}
                disabled={bulkVerifying}
                className={cn(TAP, APPROVE_BUTTON, "rounded-[10px] font-bold")}
              >
                {bulkVerifying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle className="h-4 w-4" aria-hidden="true" />}
                {filteredPending.length === pending.length ? "Verify all" : `Verify these ${filteredPending.length}`}
              </Button>
            )}
          </>
        }
      >
        {filteredPending.length === 0 ? (
          <p className={cn("px-5 py-[18px] text-sm font-semibold", pending.length === 0 ? TONE_TEXT.good : "text-muted-foreground")}>
            {pending.length === 0 ? "All check-ins are verified." : "No check-ins match these filters."}
          </p>
        ) : (
          /* Verified or declined rows slide out instead of vanishing, so it is
             clear which one was handled. */
          <LazyMotion features={domAnimation} strict>
            <MotionConfig reducedMotion="user">
              <ul aria-labelledby="checkins-title">
                <AnimatePresence initial={false}>
                  {filteredPending.map((row) => {
                    const pill = checkInTone(row.status);
                    const name = row.student_name || "—";
                    return (
                      <m.li
                        key={row.id}
                        layout
                        exit={{ opacity: 0, x: 48, transition: { duration: 0.25 } }}
                        className="flex flex-wrap items-center gap-3.5 border-t border-border/60 px-5 py-3 first:border-t-0"
                      >
                        <InitialsBadge name={name} />
                        <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                          <strong className="truncate text-sm font-semibold text-foreground">{name}</strong>
                          <span className="text-xs text-muted-foreground">{row.cohort_name}</span>
                        </span>
                        <span className="text-sm text-muted-foreground sm:w-48">{formatAttendanceDate(row.marked_at)}</span>
                        <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                        <span className="ml-auto flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => verifyOne(row.id)}
                            disabled={verifyingId === row.id}
                            className={cn(TAP, QUIET_BUTTON, "rounded-[10px] font-semibold")}
                          >
                            {verifyingId === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" />
                            ) : (
                              <>Verify<span className="sr-only"> {name}</span></>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => declineOne(row.id)}
                            disabled={verifyingId === row.id}
                            className={cn(TAP, REJECT_BUTTON, "rounded-[10px] font-semibold")}
                          >
                            <XCircle className="h-4 w-4" aria-hidden="true" /> Decline<span className="sr-only"> {name}</span>
                          </Button>
                        </span>
                      </m.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </MotionConfig>
          </LazyMotion>
        )}
      </Panel>

      {/* Who is attending, class by class. Same cohort filter as the
          statistics below; lowest attendance first. */}
      <Panel title="Attendance heatmap" titleId="heatmap-title">
        <div className="p-5">
          <AttendanceHeatmap data={heatmap} />
        </div>
      </Panel>

      {/* Student statistics */}
      <Panel
        title={
          <>
            Students
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {filteredStats.length === stats.length
                ? `${stats.length} students`
                : `${filteredStats.length} of ${stats.length} students`}
            </span>
          </>
        }
        titleId="students-title"
      >
        <div className="flex flex-col gap-2.5 border-b border-border px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 sm:w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-[10px] pl-9 sm:h-[38px]"
              aria-label="Search students by name or cohort"
            />
          </div>
          <select
            className={SELECT_CLASS}
            value={statsCohortFilter}
            onChange={(e) => setStatsCohortFilter(e.target.value)}
            aria-label="Filter by cohort"
          >
            <option value="all">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className={SELECT_CLASS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">Any status</option>
            <option value="present">Has present</option>
            <option value="late">Has late</option>
            <option value="absent">Has missed class</option>
          </select>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              type="date"
              value={statsFrom}
              max={statsTo || undefined}
              onChange={(e) => setStatsFrom(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-[10px] sm:h-[38px] sm:max-w-[160px]"
              aria-label="Statistics from date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={statsTo}
              min={statsFrom || undefined}
              onChange={(e) => setStatsTo(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-[10px] sm:h-[38px] sm:max-w-[160px]"
              aria-label="Statistics to date"
            />
          </div>
          {statsFiltersActive && (
            <Button type="button" variant="ghost" onClick={clearStatsFilters} className={TAP}>
              Clear filters
            </Button>
          )}
          {(statsFrom || statsTo) && (
            <p className="w-full text-xs text-muted-foreground">
              Percentages are recalculated over the selected period. "Classes held" counts only sessions in range.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs uppercase tracking-wide">
                <TableHead className="pl-5">Name</TableHead>
                <TableHead className="hidden lg:table-cell">Cohort</TableHead>
                <TableHead className="hidden md:table-cell">Classes held</TableHead>
                <TableHead className="hidden md:table-cell">Attended</TableHead>
                <TableHead className="hidden md:table-cell">Late</TableHead>
                <TableHead className="hidden md:table-cell">Missed</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No students found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStats.map((s) => (
                  <TableRow key={s.student_id}>
                    <TableCell className="pl-5">
                      <button
                        type="button"
                        className="min-h-11 rounded-sm text-left font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                        onClick={() => openDetail(s.student_id)}
                      >
                        {s.name || "—"}
                      </button>
                      {/* The counts that lose their own column on a narrow
                          screen still have to be readable somewhere. */}
                      <span className="mt-0.5 block text-xs text-muted-foreground lg:hidden">
                        {s.cohort_name}
                        <span className="md:hidden">
                          {" · "}{s.verified_present}/{s.total_classes} attended · {s.late_count} late · {s.absent_count} missed
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{s.cohort_name}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.total_classes}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.verified_present}</TableCell>
                    <TableCell className={`hidden md:table-cell ${s.late_count > 0 ? `${TONE_TEXT.warn} font-medium` : "text-muted-foreground"}`}>
                      {s.late_count}
                    </TableCell>
                    <TableCell className={`hidden md:table-cell ${s.absent_count > 0 ? `${TONE_TEXT.bad} font-medium` : "text-muted-foreground"}`}>
                      {s.absent_count}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={pctTone(s.attendance_pct)}>{s.attendance_pct}%</StatusPill>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openDetail(s.student_id)}
                          className={cn(TAP_SM, QUIET_BUTTON, "rounded-lg")}
                        >
                          History<span className="sr-only"> for {s.name}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleExportStudentAttendance(s.student_id, s.name)}
                          className={cn(TAP_SM, QUIET_BUTTON, "rounded-lg")}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export<span className="sr-only"> {s.name}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="px-5 pb-4 pt-3 text-[13px] text-muted-foreground">
          History opens each record to edit: Present, Late, Absent or Excused, and mark as verified.
        </p>
      </Panel>

      {/* "+ Add record": choose the student, then add it from their history. */}
      <Dialog open={addPickerOpen} onOpenChange={setAddPickerOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add an attendance record</DialogTitle>
            <DialogDescription>Choose the student. Their history opens with the add form at the top.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Search by name or cohort…"
            value={addPickerQuery}
            onChange={(e) => setAddPickerQuery(e.target.value)}
            aria-label="Search students"
            className="h-11"
          />
          {pickerMatches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No students match.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {pickerMatches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => { setAddPickerOpen(false); openDetail(s.id); }}
                    className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                  >
                    <InitialsBadge name={s.name} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.cohort_name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

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
