import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, BookOpen, ClipboardList, CreditCard, Calendar, Megaphone, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface FeeBreakdown {
  paid: number;
  unpaid: number;
  partial: number;
  total: number;
  status: string;
}

interface DashboardData {
  firstName: string;
  admissionStatus: string | null;
  attendanceRate: number | null;
  totalCourses: number;
  completedCourses: number;
  pendingAssignments: number;
  totalAssignments: number;
  fees: FeeBreakdown;
  upcomingEvents: Array<{ id: string; title: string; start_date: string; end_date: string | null; category: string | null }>;
  announcements: Array<{ title: string; body: string; published_at: string | null }>;
}

interface CohortOption {
  id: string;
  name: string;
}

const EMPTY_DATA: DashboardData = {
  firstName: "Student",
  admissionStatus: null,
  attendanceRate: null,
  totalCourses: 0,
  completedCourses: 0,
  pendingAssignments: 0,
  totalAssignments: 0,
  fees: { paid: 0, unpaid: 0, partial: 0, total: 0, status: "N/A" },
  upcomingEvents: [],
  announcements: [],
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { role, student, user, profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [savingProfileCompletion, setSavingProfileCompletion] = useState(false);
  const [profileCompletionForm, setProfileCompletionForm] = useState({
    gender: "",
    age: "",
    cohort_id: "",
  });
  const [cohortOptions, setCohortOptions] = useState<CohortOption[]>([]);

  const normalizeStatus = (s: string | null | undefined) => (s ?? "").toUpperCase();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setData(EMPTY_DATA);
        return;
      }

      console.log("[Dashboard] Loading for user:", authUser.id);

      const [profileRes, studentRes, coursesRes, announcementsRes, cohortsRes] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", authUser.id).maybeSingle(),
        supabase.from("students").select("id, profile_id, cohort_id, admission_status, is_approved, gender, age").eq("profile_id", authUser.id).maybeSingle(),
        supabase.from("courses").select("id"),
        supabase.from("announcements").select("title, body, published_at").eq("is_published", true).order("published_at", { ascending: false }).limit(3),
        supabase.from("cohorts").select("id, name").order("created_at", { ascending: false }),
      ]);

      console.log("[Dashboard] Profile:", profileRes.data, "Student:", studentRes.data);

      const firstName = profileRes.data?.first_name || authUser.user_metadata?.full_name?.split(' ')?.[0] || "Student";
      const studentRecord = studentRes.data;
      const studentId = studentRecord?.id || null;
      const cohortId = studentRecord?.cohort_id || null;
      const admissionStatus = studentRecord?.admission_status || null;
      const statusUpper = normalizeStatus(admissionStatus);
      const isAdmitted = statusUpper === "ADMITTED" || statusUpper === "APPROVED";
      const isGraduate = statusUpper === "GRADUATE";

      if (cohortsRes.data) {
        setCohortOptions(cohortsRes.data as CohortOption[]);
      }

      if (studentRecord) {
        const hasIncompleteProfile = !studentRecord.gender || !studentRecord.age || !studentRecord.cohort_id;
        setShowProfileCompletion(hasIncompleteProfile);
        setProfileCompletionForm({
          gender: studentRecord.gender || "",
          age: studentRecord.age?.toString() || "",
          cohort_id: studentRecord.cohort_id || "",
        });
      }

      let attendanceRate: number | null = null;
      let pendingAssignments = 0;
      let totalAssignments = 0;
      let fees: FeeBreakdown = { paid: 0, unpaid: 0, partial: 0, total: 0, status: "N/A" };
      let completedCourses = 0;
      let upcomingEvents: DashboardData["upcomingEvents"] = [];

      // Completed courses
      if (cohortId) {
        try {
          const { data: completedData } = await supabase.from("courses").select("id").eq("cohort_id", cohortId).eq("is_completed", true);
          completedCourses = completedData?.length ?? 0;
        } catch (e) { console.warn("[Dashboard] Completed courses fetch failed:", e); }
      }

      if (studentId) {
        try {
          const { data: attendance } = await supabase.from("attendance").select("status").eq("student_id", studentId);
          if (attendance && attendance.length > 0) {
            const present = attendance.filter((a) => a.status === "Present").length;
            attendanceRate = Math.round((present / attendance.length) * 100);
          }
        } catch (e) {
          console.warn("[Dashboard] Attendance fetch failed:", e);
        }

        if (isAdmitted && cohortId) {
          try {
            const [assignRes, submissionRes] = await Promise.all([
              supabase.from("assignments").select("id").eq("cohort_id", cohortId),
              supabase.from("assignment_submissions").select("assignment_id").eq("student_id", studentId),
            ]);
            const allIds = new Set((assignRes.data ?? []).map((a) => a.id));
            const submittedIds = new Set((submissionRes.data ?? []).map((s) => s.assignment_id));
            totalAssignments = allIds.size;
            pendingAssignments = [...allIds].filter((id) => !submittedIds.has(id)).length;
          } catch (e) {
            console.warn("[Dashboard] Assignments fetch failed:", e);
          }
        }

        try {
          const { data: feesData } = await supabase.from("fees").select("payment_status").eq("student_id", studentId);
          if (feesData && feesData.length > 0) {
            const paid = feesData.filter(f => f.payment_status === "Paid").length;
            const unpaid = feesData.filter(f => f.payment_status === "Unpaid").length;
            const partial = feesData.filter(f => f.payment_status === "Partial").length;
            const total = feesData.length;
            let status = "N/A";
            if (paid === total) status = "Paid";
            else if (unpaid === total) status = "Unpaid";
            else status = "Partial";
            fees = { paid, unpaid, partial, total, status };
          }
        } catch (e) {
          console.warn("[Dashboard] Fees fetch failed:", e);
        }
      }

      // Upcoming events from school_events
      try {
        const cohortId = studentRecord?.cohort_id;
        const orQuery = cohortId
          ? `target_cohort_id.is.null,target_cohort_id.eq.${cohortId}`
          : `target_cohort_id.is.null`;
        const { data: eventsData } = await supabase
          .from("school_events")
          .select("id, title, start_date, end_date, category")
          .or(orQuery)
          .gte("start_date", new Date().toISOString())
          .order("start_date", { ascending: true })
          .limit(5);
        if (eventsData) {
          upcomingEvents = eventsData;
        }
      } catch (e) {
        console.warn("[Dashboard] Events fetch failed:", e);
      }

      setData({
        firstName,
        admissionStatus,
        attendanceRate,
        totalCourses: coursesRes.data?.length || 0,
        completedCourses,
        pendingAssignments,
        totalAssignments,
        fees,
        upcomingEvents,
        announcements: announcementsRes.data ?? [],
      });

    } catch (err) {
      console.error("[Dashboard] Load error:", err);
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProfileCompletion = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      toast.error("Your session expired. Please log in again.");
      return;
    }

    const parsedAge = Number(profileCompletionForm.age);
    if (!profileCompletionForm.gender) { toast.error("Please select your gender."); return; }
    if (!Number.isInteger(parsedAge) || parsedAge <= 0) { toast.error("Please enter a valid age."); return; }
    if (!profileCompletionForm.cohort_id) { toast.error("Please select your cohort."); return; }

    setSavingProfileCompletion(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({ gender: profileCompletionForm.gender, age: parsedAge, cohort_id: profileCompletionForm.cohort_id })
        .eq("profile_id", authUser.id);
      if (error) throw error;
      toast.success("Profile details saved.");
      setShowProfileCompletion(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile details.");
    } finally {
      setSavingProfileCompletion(false);
    }
  };

  const statusUpper = normalizeStatus(data?.admissionStatus);
  const isPending = statusUpper === "PENDING";

  return (
    <StudentLayout admissionStatus={data?.admissionStatus}>
      {/* Profile Completion Dialog */}
      <Dialog open={showProfileCompletion} onOpenChange={() => undefined}>
        <DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Complete your profile</DialogTitle>
            <DialogDescription>Please provide your gender, age, and cohort selection to continue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Gender</Label>
              <select className="w-full border border-border bg-background p-2 rounded" value={profileCompletionForm.gender} onChange={(e) => setProfileCompletionForm(p => ({...p, gender: e.target.value}))}>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input type="number" value={profileCompletionForm.age} onChange={(e) => setProfileCompletionForm(p => ({...p, age: e.target.value}))} />
            </div>
            <div className="space-y-2">
              <Label>Cohort</Label>
              <select className="w-full border border-border bg-background p-2 rounded" value={profileCompletionForm.cohort_id} onChange={(e) => setProfileCompletionForm(p => ({...p, cohort_id: e.target.value}))}>
                <option value="">Select cohort</option>
                {cohortOptions?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button className="w-full" onClick={saveProfileCompletion} disabled={savingProfileCompletion}>
              {savingProfileCompletion ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Save and continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {/* Welcome */}
        {loading ? (
          <Skeleton className="h-10 w-64" />
        ) : (
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {data?.firstName ?? "Student"} 👋</h1>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Attendance Card */}
          {(() => {
            const rate = data?.attendanceRate;
            const isGood = rate != null && rate >= 75;
            const isWarning = rate != null && rate >= 50 && rate < 75;
            const isDanger = rate != null && rate < 50;
            const borderColor = loading ? "border-border" : isGood ? "border-emerald-500" : isWarning ? "border-amber-500" : isDanger ? "border-red-500" : "border-border";
            const bgColor = loading ? "" : isGood ? "bg-emerald-50 dark:bg-emerald-950/20" : isWarning ? "bg-amber-50 dark:bg-amber-950/20" : isDanger ? "bg-red-50 dark:bg-red-950/20" : "";
            const iconColor = loading ? "text-muted-foreground" : isGood ? "text-emerald-600" : isWarning ? "text-amber-600" : isDanger ? "text-red-600" : "text-muted-foreground";
            const valueColor = loading ? "" : isGood ? "text-emerald-700 dark:text-emerald-400" : isWarning ? "text-amber-700 dark:text-amber-400" : isDanger ? "text-red-700 dark:text-red-400" : "";
            return (
              <Card className={`border-l-4 ${borderColor} ${bgColor} transition-colors`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Attendance</CardTitle>
                  <CalendarCheck className={`h-4 w-4 ${iconColor}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${valueColor}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : (rate != null ? `${rate}%` : "—")}
                  </div>
                  {!loading && rate != null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {isGood ? "Good standing" : isWarning ? "Needs improvement" : "At risk"}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Courses Card */}
          {(() => {
            const total = data?.totalCourses ?? 0;
            const completed = data?.completedCourses ?? 0;
            const hasData = !loading && total > 0;
            const allDone = hasData && completed === total;
            const borderColor = !hasData ? "border-border" : allDone ? "border-emerald-500" : "border-primary";
            const bgColor = !hasData ? "" : allDone ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-primary/5";
            const iconColor = !hasData ? "text-muted-foreground" : allDone ? "text-emerald-600" : "text-primary";
            return (
              <Card className={`border-l-4 ${borderColor} ${bgColor} transition-colors`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Courses</CardTitle>
                  <BookOpen className={`h-4 w-4 ${iconColor}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16" /> : total}</div>
                  {!loading && total > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {completed} completed · {total - completed} ongoing
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Pending Tasks Card */}
          {(() => {
            const pending = data?.pendingAssignments ?? 0;
            const total = data?.totalAssignments ?? 0;
            const hasTasks = !loading && !isPending && total > 0;
            const allDone = hasTasks && pending === 0;
            const borderColor = !hasTasks ? "border-border" : allDone ? "border-emerald-500" : pending > 3 ? "border-red-500" : "border-amber-500";
            const bgColor = !hasTasks ? "" : allDone ? "bg-emerald-50 dark:bg-emerald-950/20" : pending > 3 ? "bg-red-50 dark:bg-red-950/20" : "bg-amber-50 dark:bg-amber-950/20";
            const iconColor = !hasTasks ? "text-muted-foreground" : allDone ? "text-emerald-600" : pending > 3 ? "text-red-600" : "text-amber-600";
            const valueColor = !hasTasks ? "" : allDone ? "text-emerald-700 dark:text-emerald-400" : pending > 3 ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400";
            return (
              <Card className={`border-l-4 ${borderColor} ${bgColor} transition-colors`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
                  <ClipboardList className={`h-4 w-4 ${iconColor}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${valueColor}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : (isPending ? "—" : pending)}
                  </div>
                  {!loading && !isPending && total > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {total - pending} submitted · {total} total
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Fees Card */}
          {(() => {
            const f = data?.fees ?? EMPTY_DATA.fees;
            const isPaid = f.status === "Paid";
            const isUnpaid = f.status === "Unpaid";
            const isPartial = f.status === "Partial";
            const borderColor = loading ? "border-border" : isPaid ? "border-emerald-500" : isUnpaid ? "border-red-500" : isPartial ? "border-amber-500" : "border-border";
            const bgColor = loading ? "" : isPaid ? "bg-emerald-50 dark:bg-emerald-950/20" : isUnpaid ? "bg-red-50 dark:bg-red-950/20" : isPartial ? "bg-amber-50 dark:bg-amber-950/20" : "";
            const iconColor = loading ? "text-muted-foreground" : isPaid ? "text-emerald-600" : isUnpaid ? "text-red-600" : isPartial ? "text-amber-600" : "text-muted-foreground";
            const valueColor = loading ? "" : isPaid ? "text-emerald-700 dark:text-emerald-400" : isUnpaid ? "text-red-700 dark:text-red-400" : isPartial ? "text-amber-700 dark:text-amber-400" : "";
            return (
              <Card className={`border-l-4 ${borderColor} ${bgColor} transition-colors`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Fees</CardTitle>
                  <CreditCard className={`h-4 w-4 ${iconColor}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${valueColor}`}>
                    {loading ? <Skeleton className="h-7 w-16" /> : f.status}
                  </div>
                  {!loading && f.total > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {f.paid} paid · {f.unpaid + f.partial} pending
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Upcoming Events — always visible */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Upcoming Schedule & Events
            </CardTitle>
            <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={() => navigate("/student/calendar")}>View All Events →</Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : data?.upcomingEvents && data.upcomingEvents.length > 0 ? (
              <div className="space-y-3">
                {data.upcomingEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-foreground">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(ev.start_date).toLocaleDateString()}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{ev.category || "General"}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming events scheduled.</p>
            )}
          </CardContent>
        </Card>

        {/* Announcements — always visible */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4" /> Announcements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : data?.announcements && data.announcements.length > 0 ? (
              <div className="space-y-3">
                {data.announcements.map((a, i) => (
                  <div key={i} className="border-b border-border pb-2 last:border-0">
                    <p className="font-medium text-sm text-foreground">{a?.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a?.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No announcements at this time.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
};

export default StudentDashboard;
