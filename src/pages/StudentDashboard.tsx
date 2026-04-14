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
import { Progress } from "@/components/ui/progress";
import { CalendarCheck, BookOpen, ClipboardList, CreditCard, Calendar, Megaphone, Loader2, AlertCircle, TrendingUp, ChevronRight, Sparkles, GraduationCap, Award, FileText, Zap } from "lucide-react";
import { toast } from "sonner";
import Reveal from "@/components/Reveal";

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

      const [profileRes, studentRes, coursesRes, announcementsRes, cohortsRes] = await Promise.all([
        supabase.from("profiles").select("first_name, middle_name, last_name").eq("id", authUser.id).maybeSingle(),
        supabase.from("students").select("id, profile_id, cohort_id, admission_status, is_approved, gender, age").eq("profile_id", authUser.id).maybeSingle(),
        supabase.from("courses").select("id"),
        supabase.from("announcements").select("title, body, published_at").eq("is_published", true).order("published_at", { ascending: false }).limit(3),
        supabase.from("cohorts").select("id, name").eq("is_active", true).order("created_at", { ascending: false }),
      ]);

      const firstName = profileRes.data ? [profileRes.data.first_name, profileRes.data.middle_name, profileRes.data.last_name].filter(Boolean).join(' ') : authUser.user_metadata?.full_name || "Student";
      const studentRecord = studentRes.data;
      const studentId = studentRecord?.id || null;
      const cohortId = studentRecord?.cohort_id || null;
      const admissionStatus = studentRecord?.admission_status || null;
      const statusUpper = normalizeStatus(admissionStatus);
      const isAdmitted = statusUpper === "ADMITTED" || statusUpper === "APPROVED";

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

      if (cohortId) {
        try {
          const { data: completedData } = await supabase.from("courses").select("id").eq("cohort_id", cohortId).eq("is_completed", true);
          completedCourses = completedData?.length ?? 0;
        } catch (e) {}
      }

      if (studentId) {
        try {
          const { data: attendance } = await supabase.from("attendance").select("status").eq("student_id", studentId);
          if (attendance && attendance.length > 0) {
            const present = attendance.filter((a) => a.status === "Present").length;
            attendanceRate = Math.round((present / attendance.length) * 100);
          }
        } catch (e) {}

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
          } catch (e) {}
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
        } catch (e) {}
      }

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
      } catch (e) {}

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
      const updatePayload: Record<string, any> = {
        gender: profileCompletionForm.gender,
        age: parsedAge,
        cohort_id: profileCompletionForm.cohort_id,
      };

      const { error } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("profile_id", authUser.id)
        .select();

      if (error) {
        throw new Error(error.message);
      }

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
  const isAdmitted = statusUpper === "ADMITTED" || statusUpper === "APPROVED";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getCategoryColor = (cat: string | null) => {
    switch ((cat || '').toUpperCase()) {
      case 'HOLIDAY': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
      case 'EXAM': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case 'EVENT': return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
      case 'BREAK': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
      default: return 'bg-primary/10 text-primary';
    }
  };

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

      <div className="space-y-6 pb-20 md:pb-0">
        {/* Welcome Banner */}
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-6 sm:p-8 text-primary-foreground">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10">
              {loading ? (
                <Skeleton className="h-8 w-64 bg-white/20" />
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 opacity-80" />
                    <span className="text-sm opacity-80">{getGreeting()}</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold">{data?.firstName ?? "Student"} 👋</h1>
                  {data?.admissionStatus && (
                    <div className="mt-3 inline-flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" />
                      <Badge variant="secondary" className="bg-white/20 text-primary-foreground border-0 hover:bg-white/30">
                        {data.admissionStatus}
                      </Badge>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Reveal>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Attendance Card */}
          <Reveal delay={0}>
            {(() => {
              const rate = data?.attendanceRate;
              const isGood = rate != null && rate >= 75;
              const isWarning = rate != null && rate >= 50 && rate < 75;
              const isDanger = rate != null && rate < 50;
              return (
                <Card className="group relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer" onClick={() => navigate('/student/attendance')}>
                  <div className={`absolute inset-0 opacity-[0.07] ${isGood ? 'bg-emerald-500' : isWarning ? 'bg-amber-500' : isDanger ? 'bg-red-500' : 'bg-muted'}`} />
                  <div className={`absolute top-0 left-0 w-1 h-full ${loading ? 'bg-muted' : isGood ? 'bg-emerald-500' : isWarning ? 'bg-amber-500' : isDanger ? 'bg-red-500' : 'bg-muted'}`} />
                  <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Attendance</CardTitle>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${loading ? 'bg-muted' : isGood ? 'bg-emerald-100 dark:bg-emerald-900/40' : isWarning ? 'bg-amber-100 dark:bg-amber-900/40' : isDanger ? 'bg-red-100 dark:bg-red-900/40' : 'bg-muted'}`}>
                      <CalendarCheck className={`h-4 w-4 ${loading ? 'text-muted-foreground' : isGood ? 'text-emerald-600 dark:text-emerald-400' : isWarning ? 'text-amber-600 dark:text-amber-400' : isDanger ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className={`text-2xl sm:text-3xl font-bold ${loading ? '' : isGood ? 'text-emerald-700 dark:text-emerald-400' : isWarning ? 'text-amber-700 dark:text-amber-400' : isDanger ? 'text-red-700 dark:text-red-400' : ''}`}>
                      {loading ? <Skeleton className="h-8 w-16" /> : (rate != null ? `${rate}%` : "—")}
                    </div>
                    {!loading && rate != null && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isGood ? "Great standing ✨" : isWarning ? "Needs improvement" : "At risk ⚠️"}
                        </p>
                        <Progress value={rate} className="mt-2 h-1.5" />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </Reveal>

          {/* Courses Card */}
          <Reveal delay={80}>
            {(() => {
              const total = data?.totalCourses ?? 0;
              const completed = data?.completedCourses ?? 0;
              const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
              const allDone = total > 0 && completed === total;
              return (
                <Card className="group relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer" onClick={() => navigate('/student/courses')}>
                  <div className={`absolute inset-0 opacity-[0.07] ${allDone ? 'bg-emerald-500' : 'bg-primary'}`} />
                  <div className={`absolute top-0 left-0 w-1 h-full ${!loading && total > 0 ? (allDone ? 'bg-emerald-500' : 'bg-primary') : 'bg-muted'}`} />
                  <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Courses</CardTitle>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${allDone ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-primary/10'}`}>
                      <BookOpen className={`h-4 w-4 ${allDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="text-2xl sm:text-3xl font-bold">{loading ? <Skeleton className="h-8 w-16" /> : total}</div>
                    {!loading && total > 0 && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          {completed}/{total} completed
                        </p>
                        <Progress value={progress} className="mt-2 h-1.5" />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </Reveal>

          {/* Pending Tasks Card */}
          <Reveal delay={160}>
            {(() => {
              const pending = data?.pendingAssignments ?? 0;
              const total = data?.totalAssignments ?? 0;
              const hasTasks = !loading && !isPending && total > 0;
              const allDone = hasTasks && pending === 0;
              const submitted = total - pending;
              const progress = total > 0 ? Math.round((submitted / total) * 100) : 0;
              return (
                <Card className="group relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer" onClick={() => navigate('/student/assignments')}>
                  <div className={`absolute inset-0 opacity-[0.07] ${!hasTasks ? 'bg-muted' : allDone ? 'bg-emerald-500' : pending > 3 ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className={`absolute top-0 left-0 w-1 h-full ${!hasTasks ? 'bg-muted' : allDone ? 'bg-emerald-500' : pending > 3 ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${!hasTasks ? 'bg-muted' : allDone ? 'bg-emerald-100 dark:bg-emerald-900/40' : pending > 3 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}`}>
                      <ClipboardList className={`h-4 w-4 ${!hasTasks ? 'text-muted-foreground' : allDone ? 'text-emerald-600 dark:text-emerald-400' : pending > 3 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className={`text-2xl sm:text-3xl font-bold ${!hasTasks ? '' : allDone ? 'text-emerald-700 dark:text-emerald-400' : pending > 3 ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {loading ? <Skeleton className="h-8 w-16" /> : (isPending ? "—" : pending)}
                    </div>
                    {!loading && !isPending && total > 0 && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          {submitted} submitted · {total} total
                        </p>
                        <Progress value={progress} className="mt-2 h-1.5" />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </Reveal>

          {/* Fees Card */}
          <Reveal delay={240}>
            {(() => {
              const f = data?.fees ?? EMPTY_DATA.fees;
              const isPaid = f.status === "Paid";
              const isUnpaid = f.status === "Unpaid";
              const isPartial = f.status === "Partial";
              const progress = f.total > 0 ? Math.round((f.paid / f.total) * 100) : 0;
              return (
                <Card className="group relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer" onClick={() => navigate('/student/fees')}>
                  <div className={`absolute inset-0 opacity-[0.07] ${loading ? 'bg-muted' : isPaid ? 'bg-emerald-500' : isUnpaid ? 'bg-red-500' : isPartial ? 'bg-amber-500' : 'bg-muted'}`} />
                  <div className={`absolute top-0 left-0 w-1 h-full ${loading ? 'bg-muted' : isPaid ? 'bg-emerald-500' : isUnpaid ? 'bg-red-500' : isPartial ? 'bg-amber-500' : 'bg-muted'}`} />
                  <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
                    <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Fees</CardTitle>
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${loading ? 'bg-muted' : isPaid ? 'bg-emerald-100 dark:bg-emerald-900/40' : isUnpaid ? 'bg-red-100 dark:bg-red-900/40' : isPartial ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-muted'}`}>
                      <CreditCard className={`h-4 w-4 ${loading ? 'text-muted-foreground' : isPaid ? 'text-emerald-600 dark:text-emerald-400' : isUnpaid ? 'text-red-600 dark:text-red-400' : isPartial ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className={`text-2xl sm:text-3xl font-bold ${loading ? '' : isPaid ? 'text-emerald-700 dark:text-emerald-400' : isUnpaid ? 'text-red-700 dark:text-red-400' : isPartial ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                      {loading ? <Skeleton className="h-8 w-16" /> : f.status}
                    </div>
                    {!loading && f.total > 0 && (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          {f.paid} paid · {f.unpaid + f.partial} pending
                        </p>
                        <Progress value={progress} className="mt-2 h-1.5" />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          </Reveal>
        </div>

        {/* Bottom Section: Events + Announcements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upcoming Events */}
          <Reveal delay={100}>
            <Card className="border-0 shadow-md h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  Upcoming Events
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs gap-1 text-primary hover:text-primary" onClick={() => navigate("/student/calendar")}>
                  View All <ChevronRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
                ) : data?.upcomingEvents && data.upcomingEvents.length > 0 ? (
                  <div className="space-y-2">
                    {data.upcomingEvents.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-medium text-primary uppercase">
                            {new Date(ev.start_date).toLocaleDateString('en', { month: 'short' })}
                          </span>
                          <span className="text-sm font-bold text-primary leading-none">
                            {new Date(ev.start_date).getDate()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{ev.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(ev.start_date).toLocaleDateString('en', { weekday: 'long' })}
                          </p>
                        </div>
                        <Badge variant="secondary" className={`text-[10px] shrink-0 ${getCategoryColor(ev.category)}`}>
                          {ev.category || "General"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No upcoming events scheduled.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </Reveal>

          {/* Announcements */}
          <Reveal delay={180}>
            <Card className="border-0 shadow-md h-full">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                    <Megaphone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  Announcements
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
                ) : data?.announcements && data.announcements.length > 0 ? (
                  <div className="space-y-2">
                    {data.announcements.map((a, i) => (
                      <div key={i} className="p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors cursor-pointer" onClick={() => navigate('/student/announcements')}>
                        <p className="font-medium text-sm text-foreground">{a?.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a?.body}</p>
                        {a?.published_at && (
                          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                            {new Date(a.published_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No announcements at this time.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </Reveal>
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentDashboard;
