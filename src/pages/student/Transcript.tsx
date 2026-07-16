import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
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

import { getLetterGrade } from "@/lib/grading";


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
        <PageHeader
          eyebrow="Academic Record"
          title="Academic Transcript"
          subtitle="Your complete academic record and performance summary."
          actions={
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 print:hidden">
              <Download className="w-4 h-4" /> Print / Save PDF
            </Button>
          }
        />

        {/* Student Info Card */}
        <Card className="shadow-[var(--shadow-card)] border-border overflow-hidden">
          <div className="h-1.5 gradient-flame" />
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="eyebrow mb-1.5">Student Name</p>
                <p className="font-serif text-xl font-semibold text-foreground leading-tight">{profile?.first_name} {profile?.last_name}</p>
              </div>
              <div>
                <p className="eyebrow mb-1.5">Cohort</p>
                <p className="font-serif text-xl font-semibold text-foreground leading-tight">{cohortName || "—"}</p>
              </div>
              <div>
                <p className="eyebrow mb-1.5">Student Code</p>
                <p className="font-serif text-xl font-semibold text-foreground leading-tight font-mono">{student?.student_code || "—"}</p>
              </div>
              <div>
                <p className="eyebrow mb-1.5">Status</p>
                <Badge variant={(student?.admission_status || "").toUpperCase() === "GRADUATE" ? "success" : "info"} className="text-xs">
                  {student?.admission_status || "—"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Overall Grade"
            value={<span className={overallGrade.color}>{overallGrade.letter}</span>}
            hint={`${overallAvg}% · ${overallGrade.label}`}
            icon={<div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center"><Award className="w-5 h-5 text-gold" /></div>}
          />
          <StatCard
            label="Courses Completed"
            value={<>{completedCount}<span className="text-lg text-muted-foreground">/{courses.length}</span></>}
            color="text-primary"
            icon={<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><BookOpen className="w-5 h-5 text-primary" /></div>}
          />
          <StatCard
            label="Tasks Graded"
            value={<>{gradedTasks}<span className="text-lg text-muted-foreground">/{totalTasks}</span></>}
            color="text-primary"
            icon={<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-primary" /></div>}
          />
          <StatCard
            label="Attendance"
            value={`${attendance.rate}%`}
            color={attendance.rate >= 75 ? "text-success" : "text-destructive"}
            progress={attendance.rate}
            progressClass={attendance.rate >= 75 ? "bg-success" : "bg-destructive"}
            hint={`${attendance.present}/${attendance.total} sessions`}
          />
        </div>

        {/* Course-by-Course Breakdown */}
        {courses.map((course) => {
          const grade = course.courseAvg != null ? getLetterGrade(course.courseAvg) : null;
          return (
            <Card key={course.id} className="shadow-[var(--shadow-card)] border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${course.is_completed ? "bg-success/10" : "bg-primary/10"}`}>
                      {course.is_completed ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Clock className="w-5 h-5 text-primary" />}
                    </div>
                    <div>
                      <CardTitle className="font-serif text-lg leading-tight">{course.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{course.code} {course.lecturer ? `· ${course.lecturer}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {grade && (
                      <div className="text-right">
                        <span className={`font-serif text-3xl font-bold leading-none ${grade.color}`}>{grade.letter}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{course.courseAvg}% · {grade.label}</p>
                      </div>
                    )}
                    <Badge variant={course.is_completed ? "success" : "info"} className="text-xs">
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
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Task</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Score</TableHead>
                          <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grade</TableHead>
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
                                {lg ? <span className={`font-serif text-lg font-bold ${lg.color}`}>{lg.letter}</span> : <span className="text-muted-foreground text-xs">Pending</span>}
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
