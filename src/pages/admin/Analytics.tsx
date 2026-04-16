import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Users, TrendingUp, CalendarCheck, ClipboardList, Download, Folder, BookOpen, GraduationCap, CreditCard } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";

interface Cohort { id: string; name: string; }

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

const TOOLTIP_STYLE = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 };

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortFilter, setCohortFilter] = useState("all");

  const [enrollmentData, setEnrollmentData] = useState<any[]>([]);
  const [enrollmentPie, setEnrollmentPie] = useState<{ name: string; value: number }[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [assignmentData, setAssignmentData] = useState<any[]>([]);
  const [materialsData, setMaterialsData] = useState<any[]>([]);
  const [materialsByType, setMaterialsByType] = useState<any[]>([]);
  const [coursePerformance, setCoursePerformance] = useState<any[]>([]);
  const [genderData, setGenderData] = useState<any[]>([]);
  const [learningModeData, setLearningModeData] = useState<any[]>([]);
  const [feeCollectionRate, setFeeCollectionRate] = useState(0);
  const [summaryCards, setSummaryCards] = useState({
    totalStudents: 0,
    totalRevenue: 0,
    avgAttendance: 0,
    avgCompletion: 0,
    totalMaterials: 0,
    totalCourses: 0,
    graduateCount: 0,
    outstandingFees: 0,
  });

  useEffect(() => {
    supabase.from("cohorts").select("id, name").order("start_date", { ascending: false }).then(({ data }) => {
      setCohorts(data || []);
    });
  }, []);

  useEffect(() => { loadAnalytics(); }, [cohortFilter]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadEnrollment(),
        loadRevenue(),
        loadAttendance(),
        loadAssignments(),
        loadMaterials(),
        loadCoursePerformance(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadEnrollment = async () => {
    let query = supabase.from("students").select("id, created_at, admission_status, cohort_id, gender, learning_mode");
    if (cohortFilter !== "all") query = query.eq("cohort_id", cohortFilter);
    const { data } = await query;
    if (!data) return;

    // Month grouping
    const monthMap: Record<string, { total: number; admitted: number; pending: number; rejected: number }> = {};
    const genderMap: Record<string, number> = {};
    const modeMap: Record<string, number> = {};

    data.forEach((s) => {
      const month = s.created_at ? new Date(s.created_at).toLocaleString("default", { month: "short", year: "2-digit" }) : "Unknown";
      if (!monthMap[month]) monthMap[month] = { total: 0, admitted: 0, pending: 0, rejected: 0 };
      monthMap[month].total++;
      const status = (s.admission_status || "").toUpperCase();
      if (status === "ADMITTED") monthMap[month].admitted++;
      else if (status === "PENDING") monthMap[month].pending++;
      else if (status === "REJECTED") monthMap[month].rejected++;

      const g = s.gender || "Not specified";
      genderMap[g] = (genderMap[g] || 0) + 1;

      const m = s.learning_mode || "Not specified";
      modeMap[m] = (modeMap[m] || 0) + 1;
    });

    const sorted = Object.entries(monthMap).map(([month, vals]) => ({ month, ...vals }));
    setEnrollmentData(sorted.length > 0 ? sorted : [{ month: "No data", total: 0, admitted: 0, pending: 0, rejected: 0 }]);

    const admitted = data.filter((s) => (s.admission_status || "").toUpperCase() === "ADMITTED").length;
    const pending = data.filter((s) => (s.admission_status || "").toUpperCase() === "PENDING").length;
    const rejected = data.filter((s) => (s.admission_status || "").toUpperCase() === "REJECTED").length;
    const graduated = data.filter((s) => (s.admission_status || "").toUpperCase() === "GRADUATE").length;

    setEnrollmentPie([
      { name: "Admitted", value: admitted },
      { name: "Pending", value: pending },
      { name: "Rejected", value: rejected },
      { name: "Graduated", value: graduated },
    ].filter((d) => d.value > 0));

    setGenderData(Object.entries(genderMap).map(([name, value]) => ({ name, value })));
    setLearningModeData(Object.entries(modeMap).map(([name, value]) => ({ name, value })));

    setSummaryCards((prev) => ({ ...prev, totalStudents: data.length, graduateCount: graduated }));
  };

  const loadRevenue = async () => {
    let query = supabase.from("fees").select("amount_paid, amount_due, fee_type, cohort_id, payment_status");
    if (cohortFilter !== "all") query = query.eq("cohort_id", cohortFilter);
    const { data } = await query;
    if (!data) return;

    const typeMap: Record<string, { collected: number; outstanding: number }> = {};
    let totalCollected = 0;
    let totalDue = 0;
    data.forEach((f) => {
      const type = f.fee_type || "Other";
      if (!typeMap[type]) typeMap[type] = { collected: 0, outstanding: 0 };
      const paid = Number(f.amount_paid) || 0;
      const due = Number(f.amount_due) || 0;
      typeMap[type].collected += paid;
      typeMap[type].outstanding += Math.max(0, due - paid);
      totalCollected += paid;
      totalDue += due;
    });

    setRevenueData(Object.entries(typeMap).map(([type, vals]) => ({ type, ...vals })));
    const collRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0;
    setFeeCollectionRate(collRate);
    setSummaryCards((prev) => ({
      ...prev,
      totalRevenue: totalCollected,
      outstandingFees: Math.max(0, totalDue - totalCollected),
    }));
  };

  const loadAttendance = async () => {
    const { data } = await supabase.from("attendance").select("status, schedule_id, student_id");
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
    let assignQuery = supabase.from("assignments").select("id, title, cohort_id, course_id, max_points, category");
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

    const result = assignments.slice(0, 10).map((a) => {
      const subs = (submissions || []).filter((s) => s.assignment_id === a.id);
      const graded = subs.filter((s) => s.grade !== null);
      const avgGrade = graded.length > 0 ? Math.round(graded.reduce((sum, s) => sum + Number(s.grade), 0) / graded.length) : 0;
      return {
        title: a.title.length > 20 ? a.title.slice(0, 20) + "…" : a.title,
        submissions: subs.length,
        avgGrade,
        maxPoints: a.max_points || 100,
        category: a.category || "Assignment",
      };
    });

    const totalSubmissions = (submissions || []).length;
    let studQuery = supabase.from("students").select("id", { count: "exact", head: true }).eq("admission_status", "ADMITTED");
    if (cohortFilter !== "all") studQuery = studQuery.eq("cohort_id", cohortFilter);
    const { count: studentCount } = await studQuery;
    const expected = (studentCount || 1) * assignments.length;
    const completionRate = expected > 0 ? Math.round((totalSubmissions / expected) * 100) : 0;

    setAssignmentData(result);
    setSummaryCards((prev) => ({ ...prev, avgCompletion: Math.min(completionRate, 100) }));
  };

  const loadMaterials = async () => {
    let query = supabase.from("course_materials").select("id, course_id, material_type, file_type, is_paid, cohort_id, created_at, courses!course_materials_course_id_fkey(title)");
    if (cohortFilter !== "all") query = query.eq("cohort_id", cohortFilter);
    const { data } = await query;
    if (!data) return;

    // By course
    const courseMap: Record<string, { name: string; count: number; paid: number; free: number }> = {};
    const typeMap: Record<string, number> = {};

    data.forEach((m: any) => {
      const courseName = m.courses?.title || "Unknown";
      const courseId = m.course_id;
      if (!courseMap[courseId]) courseMap[courseId] = { name: courseName, count: 0, paid: 0, free: 0 };
      courseMap[courseId].count++;
      if (m.is_paid) courseMap[courseId].paid++;
      else courseMap[courseId].free++;

      const ft = m.file_type || m.material_type || "Other";
      typeMap[ft] = (typeMap[ft] || 0) + 1;
    });

    setMaterialsData(Object.values(courseMap).sort((a, b) => b.count - a.count));
    setMaterialsByType(Object.entries(typeMap).map(([name, value]) => ({ name, value })));
    setSummaryCards((prev) => ({ ...prev, totalMaterials: data.length }));
  };

  const loadCoursePerformance = async () => {
    let courseQuery = supabase.from("courses").select("id, title, code, cohort_id, is_completed");
    if (cohortFilter !== "all") courseQuery = courseQuery.eq("cohort_id", cohortFilter);
    const { data: courses } = await courseQuery;
    if (!courses) return;

    setSummaryCards((prev) => ({ ...prev, totalCourses: courses.length }));

    // Get all assignments for these courses
    const courseIds = courses.map(c => c.id);
    if (courseIds.length === 0) { setCoursePerformance([]); return; }

    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, course_id, max_points")
      .in("course_id", courseIds);

    if (!assignments || assignments.length === 0) { setCoursePerformance([]); return; }

    const assignIds = assignments.map(a => a.id);
    const { data: submissions } = await supabase
      .from("assignment_submissions")
      .select("assignment_id, grade")
      .in("assignment_id", assignIds);

    const result = courses.slice(0, 10).map(c => {
      const courseAssignments = assignments.filter(a => a.course_id === c.id);
      const courseAssignIds = courseAssignments.map(a => a.id);
      const courseSubs = (submissions || []).filter(s => courseAssignIds.includes(s.assignment_id));
      const graded = courseSubs.filter(s => s.grade !== null);
      const avgGrade = graded.length > 0 ? Math.round(graded.reduce((sum, s) => sum + Number(s.grade), 0) / graded.length) : 0;
      return {
        code: c.code,
        title: c.title.length > 25 ? c.title.slice(0, 25) + "…" : c.title,
        assignments: courseAssignments.length,
        submissions: courseSubs.length,
        avgGrade,
        completed: c.is_completed,
      };
    });

    setCoursePerformance(result);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const SUMMARY = [
    { title: "Total Students", value: summaryCards.totalStudents, icon: Users, color: "text-primary" },
    { title: "Revenue Collected", value: `₦${summaryCards.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600" },
    { title: "Attendance Rate", value: `${summaryCards.avgAttendance}%`, icon: CalendarCheck, color: "text-blue-600" },
    { title: "Task Completion", value: `${summaryCards.avgCompletion}%`, icon: ClipboardList, color: "text-amber-600" },
    { title: "Total Materials", value: summaryCards.totalMaterials, icon: Folder, color: "text-violet-600" },
    { title: "Active Courses", value: summaryCards.totalCourses, icon: BookOpen, color: "text-teal-600" },
    { title: "Graduates", value: summaryCards.graduateCount, icon: GraduationCap, color: "text-primary" },
    { title: "Outstanding Fees", value: `₦${summaryCards.outstandingFees.toLocaleString()}`, icon: CreditCard, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Comprehensive insights and performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadCSV(enrollmentData, "enrollment_trends")}>Enrollment Trends</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(revenueData, "revenue_by_fee_type")}>Revenue Data</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(attendanceData, "attendance_distribution")}>Attendance Data</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(assignmentData, "task_performance")}>Task Performance</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(materialsData, "materials_by_course")}>Materials Data</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(coursePerformance, "course_performance")}>Course Performance</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SUMMARY.map((card) => (
          <Card key={card.title} className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{card.title}</p>
                <p className={`text-xl font-bold ${card.color} truncate`}>{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fee Collection Progress */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">Fee Collection Rate</p>
            <p className="text-sm font-bold text-primary">{feeCollectionRate}%</p>
          </div>
          <Progress value={feeCollectionRate} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Collected: ₦{summaryCards.totalRevenue.toLocaleString()}</span>
            <span>Outstanding: ₦{summaryCards.outstandingFees.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment Trend */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Enrollment Trends</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={enrollmentData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend />
                <Bar dataKey="admitted" name="Admitted" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pending" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Student Status Pie */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Student Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={enrollmentPie} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {enrollmentPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gender Distribution */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Gender Distribution</CardTitle></CardHeader>
          <CardContent>
            {genderData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={genderData} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {genderData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Learning Mode */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Learning Mode Distribution</CardTitle></CardHeader>
          <CardContent>
            {learningModeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={learningModeData} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {learningModeData.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Fee Type */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by Fee Type</CardTitle></CardHeader>
          <CardContent>
            {revenueData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No fee data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis dataKey="type" type="category" width={100} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip formatter={(value: number) => `₦${value.toLocaleString()}`} contentStyle={TOOLTIP_STYLE} />
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
          <CardHeader className="pb-2"><CardTitle className="text-base">Attendance Distribution</CardTitle></CardHeader>
          <CardContent>
            {attendanceData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No attendance data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={attendanceData} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="count" nameKey="status"
                    label={({ status, percentage }) => `${status} ${percentage}%`}>
                    {attendanceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Materials by Course */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Materials by Course</CardTitle></CardHeader>
          <CardContent>
            {materialsData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No materials uploaded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={materialsData.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="free" name="Free" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} stackId="a" />
                  <Bar dataKey="paid" name="Paid" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Materials by Type */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-base">Materials by File Type</CardTitle></CardHeader>
          <CardContent>
            {materialsByType.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No materials data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={materialsByType} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {materialsByType.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Task Performance */}
        <Card className="shadow-[var(--shadow-card)] border-border lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Task Performance (Top 10)</CardTitle></CardHeader>
          <CardContent>
            {assignmentData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-20">No task data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={assignmentData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="title" tick={{ fontSize: 11 }} className="fill-muted-foreground" angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="submissions" name="Submissions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgGrade" name="Avg Grade" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Course Performance Table */}
        <Card className="shadow-[var(--shadow-card)] border-border lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Course Performance Overview</CardTitle></CardHeader>
          <CardContent>
            {coursePerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No course performance data.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead className="text-center">Tasks</TableHead>
                      <TableHead className="text-center">Submissions</TableHead>
                      <TableHead className="text-center">Avg Grade</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coursePerformance.map((c) => (
                      <TableRow key={c.code}>
                        <TableCell className="font-mono text-xs">{c.code}</TableCell>
                        <TableCell className="font-medium text-sm">{c.title}</TableCell>
                        <TableCell className="text-center">{c.assignments}</TableCell>
                        <TableCell className="text-center">{c.submissions}</TableCell>
                        <TableCell className="text-center">
                          <span className={c.avgGrade >= 70 ? "text-emerald-600 font-semibold" : c.avgGrade >= 50 ? "text-amber-600" : "text-destructive"}>
                            {c.avgGrade}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.completed ? "default" : "secondary"} className="text-[10px]">
                            {c.completed ? "Completed" : "Ongoing"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAnalytics;
