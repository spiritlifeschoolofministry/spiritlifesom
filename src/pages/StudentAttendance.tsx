import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { CalendarCheck, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface AttendanceRow {
  id: string;
  marked_at: string | null;
  status: string;
  is_verified: boolean;
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

  const loadData = useCallback(async () => {
    if (!student?.id) return;

    try {
      const today = todayDateString();

      const [historyRes, todaySchedulesRes, todayAttendanceRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, marked_at, status, is_verified")
          .eq("student_id", student.id)
          .order("marked_at", { ascending: false }),
        student.cohort_id
          ? supabase
              .from("schedule")
              .select("id, date, courses!inner(cohort_id)")
              .eq("date", today)
              .eq("courses.cohort_id", student.cohort_id)
              .limit(1)
          : { data: null, error: null },
        supabase
          .from("attendance")
          .select("id, marked_at, is_verified")
          .eq("student_id", student.id),
      ]);

      if (historyRes.error) throw historyRes.error;

      const rows = (historyRes.data || []) as AttendanceRow[];
      setHistory(rows);

      const scheduleId =
        Array.isArray(todaySchedulesRes.data) && todaySchedulesRes.data.length > 0
          ? (todaySchedulesRes.data[0] as { id: string }).id
          : null;
      setTodayScheduleId(scheduleId);

      const attendances = todayAttendanceRes.data || [];
      const todayRecords = attendances.filter(
        (a: { marked_at: string | null }) =>
          a.marked_at ? a.marked_at.startsWith(today) : false
      );
      const markedToday = todayRecords.length > 0;
      const pendingTodayRecord = todayRecords.some(
        (a: { is_verified?: boolean }) => a.is_verified === false
      );
      setCheckedInToday(markedToday);
      setPendingToday(markedToday && pendingTodayRecord);
    } catch (err) {
      console.error("[StudentAttendance] Load error:", err);
      toast.error("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [student?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCheckIn = async () => {
    if (!student?.id || !todayScheduleId || checkedInToday || checkingIn) return;

    setCheckingIn(true);
    try {
      const payload = {
        student_id: student.id,
        schedule_id: todayScheduleId,
        status: "PRESENT",
        marked_at: new Date().toISOString(),
        is_verified: false,
      };

      const { error } = await supabase.from("attendance").insert(payload);

      if (error) {
        if (error.code === "23505") {
          toast.error("You have already checked in for today.");
          setCheckedInToday(true);
          setPendingToday(true);
        } else {
          throw error;
        }
        return;
      }

      setCheckedInToday(true);
      setPendingToday(true);
      toast.success("Attendance marked. Pending approval.");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to mark attendance";
      console.error("[StudentAttendance] Check-in error:", err);
      toast.error(msg);
    } finally {
      setCheckingIn(false);
    }
  };

  const totalClasses = history.length;
  const attended = history.filter(
    (r) => (r.status || "").toUpperCase() === "PRESENT"
  ).length;
  const percentage =
    totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;

  const statusLabel = (s: string) => {
    const u = (s || "").toUpperCase();
    if (u === "PRESENT") return "Present";
    if (u === "ABSENT") return "Absent";
    if (u === "LATE") return "Late";
    return s || "—";
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  const canCheckIn =
    !checkedInToday &&
    !checkingIn &&
    todayScheduleId !== null;

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Attendance
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mark your attendance and view your history.
          </p>
        </div>

        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary" /> Check-in
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!todayScheduleId && !checkedInToday && (
              <p className="text-sm text-muted-foreground mb-4">
                No class scheduled for today. Check-in is not available.
              </p>
            )}
            <Button
              onClick={handleCheckIn}
              disabled={!canCheckIn}
              className="w-full sm:w-auto gradient-flame border-0 text-accent-foreground hover:opacity-90"
            >
              {checkingIn ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Marking…
                </>
              ) : checkedInToday ? (
                <>Check-in Pending Approval</>
              ) : (
                <>Mark Attendance for Today</>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                <CalendarCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Total Classes
                </p>
                <p className="text-xl font-bold text-foreground">
                  {totalClasses}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Attended
                </p>
                <p className="text-xl font-bold text-emerald-600">
                  {attended}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {percentage}%
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Attendance %
                </p>
                <p className="text-xl font-bold text-foreground">
                  {percentage}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Attendance History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No attendance records yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((row) => {
                      const dateStr = row.marked_at
                        ? new Date(row.marked_at).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—";
                      const verified = row.is_verified;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {dateStr}
                          </TableCell>
                          <TableCell>{statusLabel(row.status)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={verified ? "default" : "secondary"}
                              className={
                                verified
                                  ? "bg-emerald-600 hover:bg-emerald-700"
                                  : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                              }
                            >
                              {verified ? "Verified" : "Pending"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
};

export default StudentAttendance;
