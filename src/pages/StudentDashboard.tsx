import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, BookOpen, ClipboardList, CreditCard, Calendar, Megaphone } from "lucide-react";

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

const StudentDashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [profileRes, studentRes, coursesRes, announcementsRes] = await Promise.all([
          supabase.from("profiles").select("first_name").eq("id", user.id).single(),
          supabase.from("students").select("id, cohort_id, admission_status").eq("profile_id", user.id).single(),
          supabase.from("courses").select("id"),
          supabase.from("announcements").select("title, body, published_at").eq("is_published", true).order("published_at", { ascending: false }).limit(3),
        ]);

        const firstName = profileRes.data?.first_name || "Student";
        const studentId = studentRes.data?.id;
        const cohortId = studentRes.data?.cohort_id;
        const admissionStatus = studentRes.data?.admission_status || null;
        const isPending = admissionStatus === "Pending";

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
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

  const isPending = data.admissionStatus === "Pending";

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

  return (
    <StudentLayout admissionStatus={data.admissionStatus}>
      <div className="space-y-6 pb-20 md:pb-0">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Welcome back, {data.firstName} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Spirit Life School of Ministry — 2025/26 Academic Session
          </p>
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
