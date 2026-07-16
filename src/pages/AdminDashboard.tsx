import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Users, Clock, BookOpen, Calendar, UserPlus, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface PendingStudent {
  id: string;
  learning_mode: string | null;
  profile: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

interface RecentStudent {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

interface LearningModeRequest {
  id: string;
  learning_mode: string | null;
  requested_learning_mode: string | null;
  profile: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

interface DashboardStats {
  totalStudents: number;
  pendingCount: number;
  activeCourses: number;
  activeCohort: string | null;
  recentStudents: RecentStudent[];
  pendingStudents: PendingStudent[];
  learningModeRequests: LearningModeRequest[];
  certificateNameRequests: any[];
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const [studentsRes, pendingCountRes, coursesRes, cohortRes, recentRes, pendingRes, learningModeRequestsRes, certRequestsRes] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .ilike("admission_status", "pending"),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("cohorts").select("name").eq("is_active", true).maybeSingle(),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url, created_at")
          .eq("role", "student")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("students")
          .select("id, learning_mode, profile:profiles(first_name, last_name, avatar_url)")
          .ilike("admission_status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("students")
          .select("id, learning_mode, requested_learning_mode, profile:profiles(first_name, last_name, avatar_url)", { count: "exact" })
          .not("requested_learning_mode", "is", null)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("students")
          .select("id, pending_name_change, profile:profiles(first_name, last_name, avatar_url)", { count: "exact" })
          .not("pending_name_change", "is", null)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setStats({
        totalStudents: studentsRes.count || 0,
        pendingCount: pendingCountRes.count || 0,
        activeCourses: coursesRes.count || 0,
        activeCohort: cohortRes.data?.name || null,
        recentStudents: recentRes.data || [],
        pendingStudents: (pendingRes.data as any) || [],
        learningModeRequests: (learningModeRequestsRes.data as any) || [],
        certificateNameRequests: (certRequestsRes.data as any) || [],
      });
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const handleApproval = async (studentId: string, status: "Admitted" | "Rejected") => {
    try {
      const admission_status = status === "Admitted" ? "ADMITTED" : "REJECTED";
      const is_approved = status === "Admitted";

      const { data, error } = await supabase
        .from("students")
        .update({ admission_status, is_approved })
        .eq("id", studentId)
        .select();

      console.log("[AdminDashboard] Approval result:", { data, error });

      if (error) {
        console.error("Supabase error:", error);
        toast.error(error.message || "Failed to update status");
        return;
      }

      toast.success(
        status === "Admitted"
          ? "Student Admitted Successfully"
          : "Student rejected"
      );
      setStats((prev) =>
        prev
          ? {
              ...prev,
              pendingStudents: prev.pendingStudents.filter((s) => s.id !== studentId),
              pendingCount: Math.max(0, prev.pendingCount - 1),
              totalStudents: prev.totalStudents,
            }
          : null
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update status";
      console.error("Approval error:", err);
      toast.error(msg);
    }
  };

  const handleLearningModeRequest = async (studentId: string, action: "approve" | "reject") => {
    try {
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("profile_id, learning_mode, requested_learning_mode")
        .eq("id", studentId)
        .single();

      if (studentError || !studentData) {
        throw studentError || new Error("Could not load student request");
      }

      const updatePayload: any = { requested_learning_mode: null };
      if (action === "approve") {
        updatePayload.learning_mode = studentData.requested_learning_mode || null;
      }

      const { data, error } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("id", studentId)
        .select("profile_id, learning_mode, requested_learning_mode")
        .single();

      if (error || !data) {
        throw error || new Error("Failed to update learning mode request");
      }

      if (data.profile_id) {
        const notificationTitle =
          action === "approve"
            ? "Learning mode change approved"
            : "Learning mode change denied";
        const notificationBody =
          action === "approve"
            ? `Your learning mode has been updated to ${data.learning_mode}.`
            : "Your learning mode change request was rejected by an administrator.";

        await supabase.from("notifications").insert({
          user_id: data.profile_id,
          title: notificationTitle,
          body: notificationBody,
          type: "learning_mode_request",
          link: "/student/profile",
        });
      }

      toast.success(
        action === "approve"
          ? "Learning mode request approved"
          : "Learning mode request rejected"
      );

      setStats((prev) =>
        prev
          ? {
              ...prev,
              learningModeRequests: prev.learningModeRequests.filter((s) => s.id !== studentId),
            }
          : null
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process request";
      console.error("Learning mode request error:", err);
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const CARDS = [
    {
      title: "Total Students",
      value: String(stats.totalStudents),
      subtitle: "All registered students",
      icon: Users,
      color: "text-primary",
      bg: "bg-secondary",
    },
    {
      title: "Admissions/Requests",
      value: String(stats.pendingCount + (stats.learningModeRequests?.length || 0) + (stats.certificateNameRequests?.length || 0)),
      subtitle: "Awaiting approval or requests",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    
    {
      title: "Active Courses",
      value: String(stats.activeCourses),
      subtitle: "2025/26 Session",
      icon: BookOpen,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Active Cohort",
      value: stats.activeCohort || "—",
      subtitle: stats.activeCohort ? "Current session" : "None active",
      icon: Calendar,
      color: stats.activeCohort ? "text-primary" : "text-muted-foreground",
      bg: stats.activeCohort ? "bg-secondary" : "bg-muted",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-semibold text-foreground leading-none">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-2">Overview of Spirit Life School of Ministry</p>
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
                <p className={`font-serif text-3xl font-bold leading-tight ${card.color}`}>{card.value}</p>
                <p className="text-[10px] text-muted-foreground">{card.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two Column: Recent + Pending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Registrations */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" /> Recent Registrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent registrations.</p>
            ) : (
              stats.recentStudents.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <Avatar className="h-8 w-8">
                    {s.avatar_url && <AvatarImage src={s.avatar_url} />}
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {(s.first_name?.[0] || "")}{(s.last_name?.[0] || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.first_name || "Unknown"} {s.last_name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => navigate("/admin/students")}
            >
              View All Students
            </Button>
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" /> Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.pendingStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending applications. 🎉</p>
            ) : (
              stats.pendingStudents.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <Avatar className="h-8 w-8">
                    {s.profile?.avatar_url && <AvatarImage src={s.profile.avatar_url} />}
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {(s.profile?.first_name?.[0] || "")}{(s.profile?.last_name?.[0] || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.profile?.first_name || "Unknown"} {s.profile?.last_name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.learning_mode || "—"}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleApproval(s.id, "Admitted")}
                      title="Approve"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => handleApproval(s.id, "Rejected")}
                      title="Reject"
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Learning Mode Requests */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-600" /> Learning Mode Change Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.learningModeRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending learning mode requests.</p>
            ) : (
              stats.learningModeRequests.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <Avatar className="h-8 w-8">
                    {s.profile?.avatar_url && <AvatarImage src={s.profile.avatar_url} />}
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {(s.profile?.first_name?.[0] || "")}{(s.profile?.last_name?.[0] || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.profile?.first_name || "Unknown"} {s.profile?.last_name || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Current: {s.learning_mode || "—"} • Requested: {s.requested_learning_mode}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleLearningModeRequest(s.id, "approve")}
                      title="Approve"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => handleLearningModeRequest(s.id, "reject")}
                      title="Reject"
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
