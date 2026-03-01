import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  CalendarCheck,
  AlertTriangle,
  Users,
  CheckCircle,
  XCircle,
  Search,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const todayDateString = () => new Date().toISOString().split("T")[0];

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
  is_verified?: boolean | null;
}

const AdminAttendance = () => {
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [stats, setStats] = useState<StudentStat[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [lowAttendanceCount, setLowAttendanceCount] = useState(0);
  const [todayTurnout, setTodayTurnout] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [bulkVerifying, setBulkVerifying] = useState(false);
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [detailHistory, setDetailHistory] = useState<AttendanceHistoryRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

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
        .select("id, marked_at, student_id, is_verified")
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
    await Promise.all([loadSummary(), loadPendingQueue(), loadStudentStats()]);
    setLoading(false);
  }, [loadSummary, loadPendingQueue, loadStudentStats]);

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
    try {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, marked_at, status, is_verified")
        .eq("student_id", studentId)
        .order("marked_at", { ascending: false });
      if (error) throw error;
      setDetailHistory((data as AttendanceHistoryRow[]) || []);
    } catch (err) {
      toast.error("Failed to load history");
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredStats = stats.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.cohort_name.toLowerCase().includes(search.toLowerCase())
  );

  const pctColor = (pct: number) => {
    if (pct < 70) return "text-red-600 font-semibold";
    if (pct <= 85) return "text-amber-600 font-semibold";
    return "text-emerald-600 font-semibold";
  };

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <CalendarCheck className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                Total Pending
              </p>
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
              <p className="text-xs text-muted-foreground font-medium">
                Low Attendance Alert
              </p>
              <p className="text-2xl font-bold text-foreground">
                {lowAttendanceCount}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  below 75%
                </span>
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
              <p className="text-xs text-muted-foreground font-medium">
                Today's Turnout
              </p>
              <p className="text-2xl font-bold text-foreground">
                {todayTurnout}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

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
            <p className="text-sm text-muted-foreground text-center py-8">
              No pending approvals.
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
                  {pending.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.student_name || "—"}
                      </TableCell>
                      <TableCell>{row.cohort_name}</TableCell>
                      <TableCell>
                        {row.marked_at
                          ? new Date(row.marked_at).toLocaleString()
                          : "—"}
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

      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Student Statistics</CardTitle>
          <div className="relative max-w-xs mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or cohort..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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
                        <span className={pctColor(s.attendance_pct)}>
                          {s.attendance_pct}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detailStudentId} onOpenChange={() => setDetailStudentId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attendance History</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-2">
              {detailHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No records.</p>
              ) : (
                detailHistory.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <p className="text-sm font-medium capitalize">
                        {(row.status || "").toLowerCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.marked_at
                          ? new Date(row.marked_at).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                    <Badge
                      variant={row.is_verified ? "default" : "secondary"}
                      className={
                        row.is_verified
                          ? "bg-emerald-600"
                          : "bg-amber-100 text-amber-800"
                      }
                    >
                      {row.is_verified ? "Verified" : "Pending"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAttendance;
