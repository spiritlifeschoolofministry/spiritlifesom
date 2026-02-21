import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserPlus, BookOpen, DollarSign, Calendar } from "lucide-react";

interface DashboardStats {
  totalStudents: number;
  newApplications: number;
  activeCourses: number;
  monthlyRevenue: number;
  recentActivity: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    created_at: string;
  }>;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [studentsRes, pendingRes, coursesRes, feesRes, recentRes] = await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }),
          supabase.from("students").select("id", { count: "exact", head: true }).eq("admission_status", "Pending"),
          supabase.from("courses").select("id", { count: "exact", head: true }),
          supabase.from("fees").select("amount_paid").eq("payment_status", "Paid"),
          supabase
            .from("profiles")
            .select("id, first_name, last_name, email, created_at")
            .eq("role", "student")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthlyRevenue = (feesRes.data || [])
          .filter((fee) => {
            if (!fee.amount_paid) return false;
            return true;
          })
          .reduce((sum, fee) => sum + (fee.amount_paid || 0), 0);

        setStats({
          totalStudents: studentsRes.count || 0,
          newApplications: pendingRes.count || 0,
          activeCourses: coursesRes.count || 0,
          monthlyRevenue,
          recentActivity: recentRes.data || [],
        });
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

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
      icon: Users,
      color: "text-primary",
      bg: "bg-secondary",
    },
    {
      title: "New Applications",
      value: String(stats.newApplications),
      icon: UserPlus,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: "Active Courses",
      value: String(stats.activeCourses),
      icon: BookOpen,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Total Revenue",
      value: `₦${stats.monthlyRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of Spirit Life School of Ministry</p>
      </div>

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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            stats.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {activity.first_name || 'Unknown'} {activity.last_name || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground">{activity.email}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(activity.created_at).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
