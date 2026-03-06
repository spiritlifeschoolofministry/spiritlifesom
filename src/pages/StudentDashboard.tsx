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
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [latestAnnouncement, setLatestAnnouncement] = useState<any | null>(null);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [savingProfileCompletion, setSavingProfileCompletion] = useState(false);
  const [profileCompletionForm, setProfileCompletionForm] = useState({
    gender: "",
    age: "",
    cohort_id: "",
  });
  const [cohortOptions, setCohortOptions] = useState<CohortOption[]>([]);

  useEffect(() => {
    // kept for backwards compatibility; real loader is defined below
  }, []);

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

      const firstName = profileRes.data?.first_name || user.user_metadata?.first_name || "Student";
      const studentId = studentRes.data?.id || null;
      const cohortId = studentRes.data?.cohort_id || null;
      const admissionStatus = studentRes.data?.admission_status || null;
      const statusUpper = normalizeStatus(admissionStatus);
      const isPending = statusUpper === "PENDING";

      if (cohortsRes.error) throw cohortsRes.error;
      setCohortOptions((cohortsRes.data || []) as CohortOption[]);

      if (studentRes.data) {
        const hasIncompleteProfile = !studentRes.data.gender || studentRes.data.age === null || !studentRes.data.cohort_id;
        setShowProfileCompletion(hasIncompleteProfile);
        setProfileCompletionForm({
          gender: studentRes.data.gender || "",
          age: studentRes.data.age?.toString() || "",
          cohort_id: studentRes.data.cohort_id || "",
        });
      } else {
        setShowProfileCompletion(false);
      }

      let attendanceRate: number | null = null;
      let pendingAssignments = 0;
      let feeStatus = "N/A";
      let upcomingClasses: DashboardData["upcomingClasses"] = [];

      if (studentId) {
        if (!isPending) {
          // Attendance
          const { data: attendance } = await supabase
            .from("attendance")
            .select("status")
            .eq("student_id", studentId);

          if (attendance && attendance.length > 0) {
            const present = attendance.filter((a) => a.status === "Present").length;
            attendanceRate = Math.round((present / attendance.length) * 100);
          }

          // Pending assignments
          if (cohortId) {
            const [assignRes, submissionRes] = await Promise.all([
              supabase.from("assignments").select("id").eq("cohort_id", cohortId),
              supabase.from("assignment_submissions").select("assignment_id").eq("student_id", studentId),
            ]);
            const allIds = new Set((assignRes.data || []).map((a) => a.id));
            const submittedIds = new Set((submissionRes.data || []).map((s) => s.assignment_id));
            pendingAssignments = [...allIds].filter((id) => !submittedIds.has(id)).length;
          }
        }

        // Fees (always show)
        const { data: fees } = await supabase
          .from("fees")
          .select("payment_status")
          .eq("student_id", studentId);

        if (fees && fees.length > 0) {
          const statuses = fees.map((f) => f.payment_status);
          if (statuses.every((s) => s === "Paid")) feeStatus = "Paid";
          else if (statuses.some((s) => s === "Partial" || s === "Paid")) feeStatus = "Partial";
          else feeStatus = "Unpaid";
        }
      }

      // Upcoming classes
      const today = new Date().toISOString().split("T")[0];
      const { data: schedule } = await supabase
        .from("schedule")
        .select("date, day, start_time, end_time, course_id, courses(title)")
        .gt("date", today)
        .order("date", { ascending: true })
        .limit(3);

      if (schedule) {
        upcomingClasses = schedule.map((s: any) => ({
          date: s.date,
          day: s.day,
          course_title: s.courses?.title || s.description || "Class",
          start_time: s.start_time,
          end_time: s.end_time,
        }));
      }

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

      // Fetch latest announcement for immediate popup
      try {
        if (studentId) {
          const orQuery = cohortId ? `target_cohort_id.is.null,target_cohort_id.eq.${cohortId}` : `target_cohort_id.is.null`;
          const { data: latest } = await supabase
            .from('announcements')
            .select('*')
            .or(orQuery)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latest) {
            const lastSeen = localStorage.getItem('lastSeenAnnouncementId');
            const shouldShow = (latest as any).is_urgent || lastSeen !== latest.id;
            if (shouldShow) {
              setLatestAnnouncement(latest);
              // open modal after small delay to allow layout
              setTimeout(() => setShowAnnouncement(true), 250);
            }
          }
        }
      } catch (err) {
        console.error('Fetch latest announcement error:', err);
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch latest data on page load
  useEffect(() => {
    load();
  }, [load]);

  // Realtime listener: unlock UI as soon as admission_status changes (e.g., PENDING -> ADMITTED)
  useEffect(() => {
    let channel: any;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      channel = supabase
        .channel(`students-status-${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "students", filter: `profile_id=eq.${user.id}` },
          (payload: any) => {
            const newStatus = payload?.new?.admission_status as string | null | undefined;
            if (newStatus) {
              setData((prev) => (prev ? { ...prev, admissionStatus: newStatus } : prev));
              if (normalizeStatus(newStatus) === "ADMITTED") {
                // Re-load to pull in data that was previously skipped while pending
                load();
              }
            }
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (!data) return null;

  const isPending = normalizeStatus(data.admissionStatus) === "PENDING";
  const isAdmin = role === "admin" || role === "teacher";
  const hasNoStudentRecord = !student && !data.admissionStatus;

  // Show registration completion screen if authenticated but no student record exists yet
  if (hasNoStudentRecord && !isAdmin) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center py-12">
          <div className="bg-amber-100 rounded-full p-4 mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Please complete your registration</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Your profile has been created, but your student record is incomplete. Please contact the school office or an administrator to finalize your registration before accessing course materials.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Refresh Page
          </Button>
        </div>
      </StudentLayout>
    );
  }

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
      const msg = err instanceof Error ? err.message : "Failed to save profile details.";
      toast.error(msg);
    } finally {
      setSavingProfileCompletion(false);
    }
  };

  const CARDS = [
    {
      title: "Attendance Rate",
      value: isPending ? "Not available yet" : (data.attendanceRate !== null ? `${data.attendanceRate}%` : "—"),
      icon: CalendarCheck,
      color: isPending ? "text-muted-foreground" : "text-emerald-600",
      bg: isPending ? "bg-muted" : "bg-emerald-50",
    },
    {
      title: "Courses",
      value: String(data.totalCourses),
      subtitle: isPending ? "Materials locked" : undefined,
      icon: BookOpen,
      color: "text-primary",
      bg: "bg-secondary",
    },
    {
      title: "Pending Assignments",
      value: isPending ? "0" : String(data.pendingAssignments),
      icon: ClipboardList,
      color: isPending ? "text-muted-foreground" : "text-amber-600",
      bg: isPending ? "bg-muted" : "bg-amber-50",
    },
    {
      title: "Fee Status",
      value: data.feeStatus,
      icon: CreditCard,
      color: data.feeStatus === "Paid" ? "text-emerald-600" : data.feeStatus === "Partial" ? "text-amber-600" : "text-destructive",
      bg: data.feeStatus === "Paid" ? "bg-emerald-50" : data.feeStatus === "Partial" ? "bg-amber-50" : "bg-destructive/10",
    },
  ];

  if (hasNoStudentRecord && isAdmin) {
    return (
      <StudentLayout admissionStatus={data.admissionStatus}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center py-12">
          <div className="bg-secondary rounded-full p-4 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Admin View</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            You are viewing this as an Administrator. You don't have a personal student record yet.
          </p>
          <Button onClick={() => navigate("/admin/dashboard")} className="gradient-flame border-0 text-accent-foreground">
            Go to Admin Portal
          </Button>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout admissionStatus={data.admissionStatus}>
      <Dialog open={showProfileCompletion} onOpenChange={() => undefined}>
        <DialogContent
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Complete your profile</DialogTitle>
            <DialogDescription>
              Please provide your gender, age, and cohort selection to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student-gender">Gender</Label>
              <select
                id="student-gender"
                value={profileCompletionForm.gender}
                onChange={(event) =>
                  setProfileCompletionForm((prev) => ({ ...prev, gender: event.target.value }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="student-age">Age</Label>
              <Input
                id="student-age"
                type="number"
                min={1}
                value={profileCompletionForm.age}
                onChange={(event) =>
                  setProfileCompletionForm((prev) => ({ ...prev, age: event.target.value }))
                }
                placeholder="Enter your age"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="student-cohort">Cohort</Label>
              <select
                id="student-cohort"
                required
                value={profileCompletionForm.cohort_id}
                onChange={(event) =>
                  setProfileCompletionForm((prev) => ({ ...prev, cohort_id: event.target.value }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select cohort</option>
                {cohortOptions.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name}
                  </option>
                ))}
              </select>
            </div>
            <Button className="w-full" onClick={saveProfileCompletion} disabled={savingProfileCompletion}>
              {savingProfileCompletion ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                "Save and continue"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Announcement popup modal */}
      <Dialog open={showAnnouncement} onOpenChange={(open) => {
        if (!open && latestAnnouncement) {
          try {
            localStorage.setItem('lastSeenAnnouncementId', latestAnnouncement.id);
          } catch (e) {
            console.warn('Could not persist last seen announcement:', e);
          }
        }
        setShowAnnouncement(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{latestAnnouncement?.title || 'Announcement'}</DialogTitle>
            <DialogDescription>{latestAnnouncement?.body}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-2 justify-end">
            <Button onClick={() => {
              if (latestAnnouncement) localStorage.setItem('lastSeenAnnouncementId', latestAnnouncement.id);
              setShowAnnouncement(false);
            }}>Dismiss</Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="space-y-6 pb-20 md:pb-0">
        {/* Welcome Header with Admin Portal Button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Welcome back, {data.firstName} 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Spirit Life School of Ministry — 2025/26 Academic Session
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => navigate("/admin/dashboard")}
              className="flex items-center gap-2 gradient-flame border-0 text-accent-foreground"
            >
              <Shield className="w-4 h-4" /> Admin Portal
            </Button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CARDS.map((card) => (
            <Card key={card.title} className="shadow-[var(--shadow-card)] border-border">
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{card.title}</p>
                  <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                  {"subtitle" in card && card.subtitle && (
                    <p className="text-[10px] text-muted-foreground">{card.subtitle}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Classes */}
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Upcoming Classes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.upcomingClasses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming classes scheduled.</p>
              ) : (
                data.upcomingClasses.map((cls, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="text-center shrink-0 w-12">
                      <p className="text-xs text-muted-foreground">{cls.day || ""}</p>
                      <p className="text-sm font-bold text-foreground">
                        {new Date(cls.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{cls.course_title}</p>
                      {cls.start_time && (
                        <p className="text-xs text-muted-foreground">
                          {cls.start_time?.slice(0, 5)}{cls.end_time ? ` – ${cls.end_time.slice(0, 5)}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Announcements */}
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-accent" /> Recent Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No announcements yet.</p>
              ) : (
                data.announcements.map((ann, i) => (
                  <div key={i} className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-sm font-medium text-foreground">{ann.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ann.body}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentDashboard;
