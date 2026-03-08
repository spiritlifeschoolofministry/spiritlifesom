import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Users, TrendingUp, CalendarCheck, ClipboardList, Download } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";

interface Cohort { id: string; name: string; }

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortFilter, setCohortFilter] = useState("all");

  // Data states
  const [enrollmentData, setEnrollmentData] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [assignmentData, setAssignmentData] = useState<any[]>([]);
  const [summaryCards, setSummaryCards] = useState({
    totalStudents: 0,
    totalRevenue: 0,
    avgAttendance: 0,
    avgCompletion: 0,
  });

  useEffect(() => {
    supabase.from("cohorts").select("id, name").order("start_date", { ascending: false }).then(({ data }) => {
      setCohorts(data || []);
    });
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [cohortFilter]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadEnrollment(),
        loadRevenue(),
        loadAttendance(),
        loadAssignments(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadEnrollment = async () => {
    let query = supabase.from("students").select("id, created_at, admission_status, cohort_id");
    if (cohortFilter !== "all") query = query.eq("cohort_id", cohortFilter);
    const { data } = await query;
    if (!data) return;

    // Group by month
    const monthMap: Record<string, { total: number; admitted: number; pending: number; rejected: number }> = {};
    data.forEach((s) => {
      const month = s.created_at ? new Date(s.created_at).toLocaleString("default", { month: "short", year: "2-digit" }) : "Unknown";
      if (!monthMap[month]) monthMap[month] = { total: 0, admitted: 0, pending: 0, rejected: 0 };
      monthMap[month].total++;
      const status = (s.admission_status || "").toUpperCase();
      if (status === "ADMITTED") monthMap[month].admitted++;
      else if (status === "PENDING") monthMap[month].pending++;
      else if (status === "REJECTED") monthMap[month].rejected++;
    });

    const sorted = Object.entries(monthMap).map(([month, vals]) => ({ month, ...vals }));
    setEnrollmentData(sorted);

    // Status breakdown for pie
    const admitted = data.filter((s) => (s.admission_status || "").toUpperCase() === "ADMITTED").length;
    const pending = data.filter((s) => (s.admission_status || "").toUpperCase() === "PENDING").length;
    const rejected = data.filter((s) => (s.admission_status || "").toUpperCase() === "REJECTED").length;
    const graduated = data.filter((s) => (s.admission_status || "").toUpperCase() === "GRADUATE").length;

    setSummaryCards((prev) => ({ ...prev, totalStudents: data.length }));
    setEnrollmentData(sorted.length > 0 ? sorted : [{ month: "No data", total: 0, admitted: 0, pending: 0, rejected: 0 }]);

    // Store pie data in enrollment as extra
    setEnrollmentPie([
      { name: "Admitted", value: admitted },
      { name: "Pending", value: pending },
      { name: "Rejected", value: rejected },
      { name: "Graduated", value: graduated },
    ].filter((d) => d.value > 0));
  };

  const [enrollmentPie, setEnrollmentPie] = useState<{ name: string; value: number }[]>([]);

  const loadRevenue = async () => {
    let query = supabase.from("fees").select("amount_paid, amount_due, fee_type, cohort_id, payment_status");
    if (cohortFilter !== "all") query = query.eq("cohort_id", cohortFilter);
    const { data } = await query;
    if (!data) return;

    // Group by fee_type
    const typeMap: Record<string, { collected: number; outstanding: number }> = {};
    let totalCollected = 0;
    data.forEach((f) => {
      const type = f.fee_type || "Other";
      if (!typeMap[type]) typeMap[type] = { collected: 0, outstanding: 0 };
      const paid = Number(f.amount_paid) || 0;
      const due = Number(f.amount_due) || 0;
      typeMap[type].collected += paid;
      typeMap[type].outstanding += Math.max(0, due - paid);
      totalCollected += paid;
    });

    setRevenueData(Object.entries(typeMap).map(([type, vals]) => ({ type, ...vals })));
    setSummaryCards((prev) => ({ ...prev, totalRevenue: totalCollected }));
  };

  const loadAttendance = async () => {
    let query = supabase.from("attendance").select("status, schedule_id, student_id");
    // For cohort filter, we'd need a join — simplify by fetching all
    const { data } = await query;
    if (!data || data.length === 0) {
      setAttendanceData([]);
      setSummaryCards((prev) => ({ ...prev, avgAttendance: 0 }));
      return;
    }

    const statusCount: Record<string, number> = {};
    data.forEach((a) => {
      const s = a.status || "Unknown";
      statusCount[s] = (statusCount[s] || 0) + 1;
    });

    const total = data.length;
    const present = (statusCount["Present"] || 0) + (statusCount["Late"] || 0);
    const avgRate = total > 0 ? Math.round((present / total) * 100) : 0;

    setAttendanceData(Object.entries(statusCount).map(([status, count]) => ({
      status,
      count,
      percentage: Math.round((count / total) * 100),
    })));
    setSummaryCards((prev) => ({ ...prev, avgAttendance: avgRate }));
  };

  const loadAssignments = async () => {
    let assignQuery = supabase.from("assignments").select("id, title, cohort_id, course_id, max_points");
    if (cohortFilter !== "all") assignQuery = assignQuery.eq("cohort_id", cohortFilter);
    const { data: assignments } = await assignQuery;
    if (!assignments || assignments.length === 0) {
      setAssignmentData([]);
      setSummaryCards((prev) => ({ ...prev, avgCompletion: 0 }));
      return;
    }

    const assignIds = assignments.map((a) => a.id);
    const { data: submissions } = await supabase
      .from("assignment_submissions")
      .select("assignment_id, grade")
      .in("assignment_id", assignIds);

    // For each assignment, calculate submission count and avg grade
    const result = assignments.slice(0, 10).map((a) => {
      const subs = (submissions || []).filter((s) => s.assignment_id === a.id);
      const graded = subs.filter((s) => s.grade !== null);
      const avgGrade = graded.length > 0 ? Math.round(graded.reduce((sum, s) => sum + Number(s.grade), 0) / graded.length) : 0;
      return {
        title: a.title.length > 20 ? a.title.slice(0, 20) + "…" : a.title,
        submissions: subs.length,
        avgGrade,
        maxPoints: a.max_points || 100,
      };
    });

    const totalSubmissions = (submissions || []).length;
    // Count expected: each assignment × number of admitted students
    let studQuery = supabase.from("students").select("id", { count: "exact", head: true }).eq("admission_status", "ADMITTED");
    if (cohortFilter !== "all") studQuery = studQuery.eq("cohort_id", cohortFilter);
    const { count: studentCount } = await studQuery;
    const expected = (studentCount || 1) * assignments.length;
    const completionRate = expected > 0 ? Math.round((totalSubmissions / expected) * 100) : 0;

    setAssignmentData(result);
    setSummaryCards((prev) => ({ ...prev, avgCompletion: Math.min(completionRate, 100) }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const SUMMARY = [
    { title: "Total Students", value: summaryCards.totalStudents, icon: Users, color: "text-primary" },
    { title: "Total Revenue", value: `₦${summaryCards.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600" },
    { title: "Attendance Rate", value: `${summaryCards.avgAttendance}%`, icon: CalendarCheck, color: "text-blue-600" },
    { title: "Task Completion", value: `${summaryCards.avgCompletion}%`, icon: ClipboardList, color: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Insights and performance metrics</p>
        </div>
        <Select value={cohortFilter} onValueChange={setCohortFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by cohort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cohorts</SelectItem>
            {cohorts.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SUMMARY.map((card) => (
          <Card key={card.title} className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment Trend */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Enrollment Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={enrollmentData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="admitted" name="Admitted" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pending" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Enrollment Status Pie */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Student Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={enrollmentPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {enrollmentPie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue by Fee Type */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by Fee Type</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No fee data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis dataKey="type" type="category" width={100} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip
                    formatter={(value: number) => `₦${value.toLocaleString()}`}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Legend />
                  <Bar dataKey="collected" name="Collected" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="outstanding" name="Outstanding" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Attendance Distribution */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Attendance Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No attendance data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={attendanceData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="status"
                    label={({ status, percentage }) => `${status} ${percentage}%`}
                  >
                    {attendanceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Assignment Completion */}
        <Card className="shadow-[var(--shadow-card)] border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Task Performance (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {assignmentData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No task data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={assignmentData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="title" tick={{ fontSize: 11 }} className="fill-muted-foreground" angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="submissions" name="Submissions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgGrade" name="Avg Grade" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAnalytics;
