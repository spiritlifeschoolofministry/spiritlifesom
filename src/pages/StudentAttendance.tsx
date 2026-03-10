import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarCheck, Loader2, UserCheck, Clock, XCircle, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface AttendanceRow {
  id: string;
  marked_at: string | null;
  status: string;
  is_verified: boolean;
  check_in_time: string | null;
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

const StudentAttendance = () => {
  const { student } = useAuth();
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [todayScheduleId, setTodayScheduleId] = useState<string | null>(null);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [pendingToday, setPendingToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [cohortToggle, setCohortToggle] = useState<CohortToggle | null>(null);
  const [outsideWindow, setOutsideWindow] = useState(false);
  const [windowMessage, setWindowMessage] = useState("");

  const loadData = useCallback(async () => {
    if (!student?.id) return;
    try {
      const today = todayDateString();
      const { data: studentData } = await supabase.from("students").select("cohort_id").eq("id", student.id).maybeSingle();
      const cohortId = studentData?.cohort_id;

      const [historyRes, classSettingRes, todayAttendanceRes] = await Promise.all([
        supabase.from("attendance").select("id, marked_at, status, is_verified, check_in_time").eq("student_id", student.id).order("marked_at", { ascending: false }),
        supabase.from("system_settings").select("value").eq("key", "class_today").maybeSingle(),
        supabase.from("attendance").select("id, marked_at, is_verified").eq("student_id", student.id),
      ]);

      if (historyRes.error) throw historyRes.error;
      const rows = (historyRes.data || []) as AttendanceRow[];
      setHistory(rows);

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
        if (legacyVal.date === today && legacyVal.enabled === true && !legacyVal.hasOwnProperty("cohorts")) {
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
        const { data: scheduleData } = await supabase.from("schedule").select("id").eq("date", today).limit(1);
        scheduleId = scheduleData && scheduleData.length > 0 ? scheduleData[0].id : null;
      } else {
        setOutsideWindow(false);
        setWindowMessage("");
      }

      setTodayScheduleId(scheduleId);
      const attendances = todayAttendanceRes.data || [];
      const todayRecords = attendances.filter((a: { marked_at: string | null }) => a.marked_at ? a.marked_at.startsWith(today) : false);
      setCheckedInToday(todayRecords.length > 0);
      setPendingToday(todayRecords.length > 0 && todayRecords.some((a: { is_verified?: boolean }) => a.is_verified === false));
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
      let status = "Present";
      if (cohortToggle?.late_after) {
        const [lateH, lateM] = cohortToggle.late_after.split(":").map(Number);
        if (now.getHours() * 60 + now.getMinutes() > lateH * 60 + lateM) status = "Late";
      }
      const { error } = await supabase.from("attendance").upsert({
        student_id: student.id, schedule_id: todayScheduleId, status,
        check_in_time: now.toISOString(), marked_at: now.toISOString(), is_verified: false,
      }, { onConflict: "student_id,schedule_id" });
      if (error) throw error;
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

  const totalClasses = history.length;
  const presentCount = history.filter((r) => (r.status || "").toUpperCase() === "PRESENT").length;
  const lateCount = history.filter((r) => (r.status || "").toUpperCase() === "LATE").length;
  const absentCount = history.filter((r) => (r.status || "").toUpperCase() === "ABSENT").length;
  const attended = presentCount + lateCount;
  const percentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;

  const rateColor = percentage >= 75 ? "text-emerald-700 dark:text-emerald-400" : percentage >= 50 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400";
  const rateBorder = percentage >= 75 ? "border-l-emerald-500" : percentage >= 50 ? "border-l-amber-500" : "border-l-red-500";
  const rateBg = percentage >= 75 ? "bg-emerald-50 dark:bg-emerald-950/20" : percentage >= 50 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20";

  const statusLabel = (s: string) => {
    const u = (s || "").toUpperCase();
    if (u === "PRESENT") return "Present";
    if (u === "ABSENT") return "Absent";
    if (u === "LATE") return "Late";
    return s || "—";
  };

  const statusBadgeClass = (s: string) => {
    const u = (s || "").toUpperCase();
    if (u === "PRESENT") return "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100";
    if (u === "LATE") return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100";
    if (u === "ABSENT") return "bg-red-100 text-red-800 border-red-300 hover:bg-red-100";
    return "";
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-28 rounded-xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  const classEnabled = cohortToggle?.enabled === true;
  const canCheckIn = !checkedInToday && !checkingIn && todayScheduleId !== null && classEnabled && !outsideWindow;

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Attendance</h1>
          <p className="text-muted-foreground text-sm mt-1">Mark your attendance and track your record</p>
        </div>

        {/* Attendance Rate Overview */}
        <Card className={`border-l-4 ${rateBorder} ${rateBg}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Attendance Rate</span>
              </div>
              <span className={`text-2xl font-bold ${rateColor}`}>{percentage}%</span>
            </div>
            <Progress value={percentage} className="h-2.5 mb-3" />
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {presentCount} Present</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {lateCount} Late</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> {absentCount} Absent</span>
              <span className="text-muted-foreground ml-auto">{totalClasses} Total</span>
            </div>
          </CardContent>
        </Card>

        {/* Check-in Card */}
        <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary" /> Today's Check-in
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!classEnabled && !checkedInToday && (
              <p className="text-sm text-muted-foreground mb-4">No class has been set for your cohort today.</p>
            )}
            {classEnabled && outsideWindow && !checkedInToday && (
              <div className="flex items-center gap-2 text-sm text-amber-600 mb-4">
                <Clock className="w-4 h-4" /><span>{windowMessage}</span>
              </div>
            )}
            {classEnabled && !outsideWindow && !checkedInToday && cohortToggle && (
              <p className="text-xs text-muted-foreground mb-3">
                Window: {cohortToggle.start_time} – {cohortToggle.end_time} · Late after {cohortToggle.late_after}
              </p>
            )}
            <Button onClick={handleCheckIn} disabled={!canCheckIn} variant="flame" className="w-full sm:w-auto">
              {checkingIn ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Marking…</>) : checkedInToday ? (<>Check-in {pendingToday ? "Pending Approval" : "Recorded"}</>) : (<>Mark Attendance for Today</>)}
            </Button>
          </CardContent>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total</p>
                <p className="text-xl font-bold text-foreground">{totalClasses}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Present</p>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{presentCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Late</p>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{lateCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Absent</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-400">{absentCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Attendance History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No attendance records yet.</p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Check-in Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Verification</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.marked_at ? new Date(row.marked_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusBadgeClass(row.status)}>{statusLabel(row.status)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={row.is_verified ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-amber-100 text-amber-800 border-amber-300"}>
                              {row.is_verified ? "Verified" : "Pending"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {history.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {row.marked_at ? new Date(row.marked_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                        </span>
                        <Badge variant="outline" className={statusBadgeClass(row.status)}>{statusLabel(row.status)}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "No check-in"}</span>
                        <Badge variant="outline" className={`text-[10px] ${row.is_verified ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
                          {row.is_verified ? "Verified" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
};

export default StudentAttendance;
