import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  GraduationCap, Award, BookOpen, TrendingUp, Download,
  CheckCircle2, Clock, User2, Calendar, FileText,
} from "lucide-react";

interface CourseRecord {
  id: string;
  title: string;
  code: string;
  lecturer: string | null;
  is_completed: boolean | null;
  assignments: {
    id: string;
    title: string;
    category: string;
    max_points: number;
    grade: number | null;
    reviewed_at: string | null;
  }[];
  courseAvg: number | null;
}

interface AttendanceSummary {
  total: number;
  present: number;
  rate: number;
}

const getLetterGrade = (pct: number) => {
  if (pct >= 90) return { letter: "A", label: "Excellent", color: "text-emerald-600" };
  if (pct >= 80) return { letter: "B", label: "Very Good", color: "text-blue-600" };
  if (pct >= 70) return { letter: "C", label: "Good", color: "text-cyan-600" };
  if (pct >= 60) return { letter: "D", label: "Satisfactory", color: "text-yellow-600" };
  if (pct >= 50) return { letter: "E", label: "Needs Improvement", color: "text-orange-600" };
  return { letter: "F", label: "Unsatisfactory", color: "text-red-600" };
};

const StudentTranscript = () => {
  const { student, profile } = useAuth();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary>({ total: 0, present: 0, rate: 0 });
  const [cohortName, setCohortName] = useState("");
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!student?.id || !student?.cohort_id) return;
    loadTranscript();
  }, [student?.id, student?.cohort_id]);

  const loadTranscript = async () => {
    if (!student?.id || !student?.cohort_id) return;
    try {
      setLoading(true);

      const [coursesRes, subsRes, attRes, cohortRes] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, code, lecturer, is_completed")
          .eq("cohort_id", student.cohort_id)
          .order("title"),
        supabase
          .from("assignment_submissions")
          .select("assignment_id, grade, reviewed_at, assignment:assignments(id, title, category, max_points, course_id)")
          .eq("student_id", student.id),
        supabase
          .from("attendance")
          .select("status")
          .eq("student_id", student.id),
        supabase
          .from("cohorts")
          .select("name")
          .eq("id", student.cohort_id)
          .single(),
      ]);

      if (cohortRes.data) setCohortName(cohortRes.data.name);

      // Build submissions map by course
      const subsByCourse = new Map<string, typeof subsRes.data>();
      for (const sub of (subsRes.data || []) as any[]) {
        const courseId = sub.assignment?.course_id;
        if (!courseId) continue;
        if (!subsByCourse.has(courseId)) subsByCourse.set(courseId, []);
        subsByCourse.get(courseId)!.push(sub);
      }

      const courseRecords: CourseRecord[] = (coursesRes.data || []).map((c: any) => {
        const subs = (subsByCourse.get(c.id) || []) as any[];
        const assignments = subs.map((s: any) => ({
          id: s.assignment?.id || "",
          title: s.assignment?.title || "",
          category: s.assignment?.category || "Assignment",
          max_points: s.assignment?.max_points || 100,
          grade: s.grade,
          reviewed_at: s.reviewed_at,
        }));

        const graded = assignments.filter((a: any) => a.grade != null);
        const totalPts = graded.reduce((s: number, a: any) => s + a.max_points, 0);
        const earnedPts = graded.reduce((s: number, a: any) => s + (a.grade || 0), 0);
        const courseAvg = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : null;

        return { ...c, assignments, courseAvg };
      });

      setCourses(courseRecords);

      // Attendance
      const attData = attRes.data || [];
      const present = attData.filter((a: any) => a.status === "Present" || a.status === "Late").length;
      setAttendance({
        total: attData.length,
        present,
        rate: attData.length > 0 ? Math.round((present / attData.length) * 100) : 0,
      });
    } catch (err) {
      console.error("[Transcript] Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Overall GPA calculation
  const gradedCourses = courses.filter(c => c.courseAvg != null);
  const overallAvg = gradedCourses.length > 0
    ? Math.round(gradedCourses.reduce((s, c) => s + c.courseAvg!, 0) / gradedCourses.length)
    : 0;
  const overallGrade = getLetterGrade(overallAvg);
  const completedCount = courses.filter(c => c.is_completed).length;
  const totalTasks = courses.reduce((s, c) => s + c.assignments.length, 0);
  const gradedTasks = courses.reduce((s, c) => s + c.assignments.filter(a => a.grade != null).length, 0);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0" ref={printRef}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <FileText className="w-7 h-7" /> Academic Transcript
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Your complete academic record and performance summary.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 print:hidden self-start">
            <Download className="w-4 h-4" /> Print / Save PDF
          </Button>
        </div>

        {/* Student Info Card */}
        <Card className="shadow-[var(--shadow-card)] border-border overflow-hidden">
          <div className="h-2 gradient-flame" />
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <User2 className="w-5 h-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Student Name</p>
                  <p className="font-semibold text-sm">{profile?.first_name} {profile?.last_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Cohort</p>
                  <p className="font-semibold text-sm">{cohortName || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Student Code</p>
                  <p className="font-semibold text-sm font-mono">{student?.student_code || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="secondary" className="text-xs">{student?.admission_status || "—"}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 text-center">
              <p className={`text-4xl font-black ${overallGrade.color}`}>{overallGrade.letter}</p>
              <p className="text-xs text-muted-foreground mt-1">Overall Grade</p>
              <p className="text-sm font-semibold text-foreground">{overallAvg}%</p>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 text-center">
              <p className="text-4xl font-black text-foreground">{completedCount}<span className="text-lg text-muted-foreground">/{courses.length}</span></p>
              <p className="text-xs text-muted-foreground mt-1">Courses Completed</p>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 text-center">
              <p className="text-4xl font-black text-foreground">{gradedTasks}<span className="text-lg text-muted-foreground">/{totalTasks}</span></p>
              <p className="text-xs text-muted-foreground mt-1">Tasks Graded</p>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 text-center">
              <p className={`text-4xl font-black ${attendance.rate >= 75 ? "text-emerald-600" : "text-red-600"}`}>{attendance.rate}%</p>
              <p className="text-xs text-muted-foreground mt-1">Attendance Rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Course-by-Course Breakdown */}
        {courses.map((course) => {
          const grade = course.courseAvg != null ? getLetterGrade(course.courseAvg) : null;
          return (
            <Card key={course.id} className="shadow-[var(--shadow-card)] border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${course.is_completed ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-primary/10"}`}>
                      {course.is_completed ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Clock className="w-5 h-5 text-primary" />}
                    </div>
                    <div>
                      <CardTitle className="text-base">{course.title}</CardTitle>
                      <p className="text-xs text-muted-foreground">{course.code} {course.lecturer ? `· ${course.lecturer}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {grade && (
                      <div className="text-right">
                        <span className={`text-2xl font-black ${grade.color}`}>{grade.letter}</span>
                        <p className="text-xs text-muted-foreground">{course.courseAvg}% · {grade.label}</p>
                      </div>
                    )}
                    <Badge variant={course.is_completed ? "default" : "secondary"} className="text-xs">
                      {course.is_completed ? "Completed" : "In Progress"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {course.assignments.length > 0 && (
                <CardContent className="pt-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Task</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs">Score</TableHead>
                          <TableHead className="text-xs">Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {course.assignments.map((a) => {
                          const pct = a.grade != null ? Math.round((a.grade / a.max_points) * 100) : null;
                          const lg = pct != null ? getLetterGrade(pct) : null;
                          return (
                            <TableRow key={a.id}>
                              <TableCell className="text-sm">{a.title}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{a.category}</Badge></TableCell>
                              <TableCell className="text-sm">
                                {a.grade != null ? <span className="font-medium">{a.grade}/{a.max_points}</span> : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                {lg ? <span className={`font-bold text-sm ${lg.color}`}>{lg.letter}</span> : <span className="text-muted-foreground text-xs">Pending</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
              {course.assignments.length === 0 && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">No tasks submitted for this course.</p>
                </CardContent>
              )}
            </Card>
          );
        })}

        {courses.length === 0 && (
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No courses found for your cohort.</p>
            </CardContent>
          </Card>
        )}

        {/* Footer note */}
        <div className="text-center text-xs text-muted-foreground print:mt-8">
          <Separator className="mb-4" />
          <p>This transcript was generated from Spirit Life School of Ministry records.</p>
          <p>Generated on {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentTranscript;
