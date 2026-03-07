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
import { CalendarCheck, BookOpen, ClipboardList, CreditCard, Calendar, Megaphone, Shield, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface DashboardData {
  firstName: string;
  admissionStatus: string | null;
  attendanceRate: number | null;
  totalCourses: number;
  pendingAssignments: number;
  feeStatus: string;
  upcomingClasses: Array<{ date: string; day: string | null; course_title: string | null; start_time: string | null; end_time: string | null }>;
  announcements: Array<{ title: string; body: string; published_at: string | null }>;
}

interface CohortOption {
  id: string;
  name: string;
}

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { role, student } = useAuth();
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setData(null);
        return;
      }

      const [profileRes, studentRes, coursesRes, announcementsRes, cohortsRes] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("students")
          .select("id, profile_id, cohort_id, admission_status, is_approved, gender, age")
          .eq("profile_id", user.id)
          .maybeSingle(),
        supabase.from("courses").select("id"),
        supabase.from("announcements").select("title, body, published_at").eq("is_published", true).order("published_at", { ascending: false }).limit(3),
        supabase.from("cohorts").select("id, name").order("created_at", { ascending: false }),
      ]);

      const firstName = profileRes.data?.first_name || user.user_metadata?.full_name?.split(' ')[0] || "Student";
      const studentId = studentRes.data?.id || null;
      const cohortId = studentRes.data?.cohort_id || null;
      const admissionStatus = studentRes.data?.admission_status || null;
      const statusUpper = normalizeStatus(admissionStatus);
      const isAdmitted = statusUpper === "ADMITTED" || statusUpper === "APPROVED";

      if (cohortsRes.data) {
        setCohortOptions(cohortsRes.data as CohortOption[]);
      }

      if (studentRes.data) {
        const hasIncompleteProfile = !studentRes.data.gender || !studentRes.data.age || !studentRes.data.cohort_id;
        setShowProfileCompletion(hasIncompleteProfile);
        setProfileCompletionForm({
          gender: studentRes.data.gender || "",
          age: studentRes.data.age?.toString() || "",
          cohort_id: studentRes.data.cohort_id || "",
        });
      }

      // Attendance & assignments — fetch regardless, just default to safe values on empty
      let attendanceRate: number | null = null;
      let pendingAssignments = 0;
      let feeStatus = "N/A";
      let upcomingClasses: DashboardData["upcomingClasses"] = [];

      if (studentId) {
        // Attendance — always fetch
        const { data: attendance } = await supabase.from("attendance").select("status").eq("student_id", studentId);
        if (attendance && attendance.length > 0) {
          const present = attendance.filter((a) => a.status === "Present").length;
          attendanceRate = Math.round((present / attendance.length) * 100);
        }

        // Assignments — only count if admitted and in a cohort
        if (isAdmitted && cohortId) {
          const [assignRes, submissionRes] = await Promise.all([
            supabase.from("assignments").select("id").eq("cohort_id", cohortId),
            supabase.from("assignment_submissions").select("assignment_id").eq("student_id", studentId),
          ]);
          const allIds = new Set((assignRes.data || []).map((a) => a.id));
          const submittedIds = new Set((submissionRes.data || []).map((s) => s.assignment_id));
          pendingAssignments = [...allIds].filter((id) => !submittedIds.has(id)).length;
        }

        // Fees — always fetch
        const { data: fees } = await supabase.from("fees").select("payment_status").eq("student_id", studentId);
        if (fees && fees.length > 0) {
          const statuses = fees.map((f) => f.payment_status);
          if (statuses.every((s) => s === "Paid")) feeStatus = "Paid";
          else if (statuses.some((s) => s === "Partial" || s === "Paid")) feeStatus = "Partial";
          else feeStatus = "Unpaid";
        }
      }

      // Upcoming classes — always fetch for all students
      const today = new Date().toISOString().split("T")[0];
      const { data: schedule } = await supabase.from("schedule").select("date, day, start_time, end_time, courses(title)").gt("date", today).order("date", { ascending: true }).limit(3);
      if (schedule) {
        upcomingClasses = schedule.map((s: any) => ({
          date: s.date,
          day: s.day,
          course_title: s.courses?.title || "Class",
          start_time: s.start_time,
          end_time: s.end_time,
        }));
      }

      // ALWAYS call setData so dashboard renders
      setData({
        firstName,
        admissionStatus,
        attendanceRate,
        totalCourses: coursesRes.data?.length || 0,
        pendingAssignments,
        feeStatus,
        upcomingClasses,
        announcements: announcementsRes.data || [],
      });

    } catch (err) {
      console.error("Dashboard load error:", err);
      // Even on error, set minimal data so the page isn't blank
      setData({
        firstName: "Student",
        admissionStatus: null,
        attendanceRate: null,
        totalCourses: 0,
        pendingAssignments: 0,
        feeStatus: "N/A",
        upcomingClasses: [],
        announcements: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProfileCompletion = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Your session expired. Please log in again.");
      return;
    }

    const parsedAge = Number(profileCompletionForm.age);
    if (!profileCompletionForm.gender) {
      toast.error("Please select your gender.");
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
      toast.error("Please enter a valid age.");
      return;
    }
    if (!profileCompletionForm.cohort_id) {
      toast.error("Please select your cohort.");
      return;
    }

    setSavingProfileCompletion(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({
          gender: profileCompletionForm.gender,
          age: parsedAge,
          cohort_id: profileCompletionForm.cohort_id,
        })
        .eq("profile_id", user.id);

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
                {cohortOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {data?.firstName} 👋</h1>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Attendance</CardTitle>
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-7 w-16" /> : (data?.attendanceRate != null ? `${data.attendanceRate}%` : "—")}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-7 w-16" /> : data?.totalCourses ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-7 w-16" /> : (isPending ? "—" : data?.pendingAssignments ?? 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Fees</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-7 w-16" /> : data?.feeStatus ?? "N/A"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Classes — always visible */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Upcoming Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : data?.upcomingClasses && data.upcomingClasses.length > 0 ? (
              <div className="space-y-3">
                {data.upcomingClasses.map((c, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-foreground">{c.course_title}</p>
                      <p className="text-xs text-muted-foreground">{c.day || c.date}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{c.start_time} – {c.end_time}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming classes scheduled.</p>
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
                    <p className="font-medium text-sm text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.body}</p>
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
