import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
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

/** One graded item on the transcript: an assignment submission or an exam. */
interface GradeEntry {
  id: string;
  title: string;
  category: string;
  max_points: number;
  grade: number | null;
  reviewed_at: string | null;
}

/** One session on the transcript: the cohort, its courses and its attendance. */
interface SessionRecord {
  cohortId: string;
  cohortName: string;
  studentCode: string | null;
  courses: CourseRecord[];
  attendance: AttendanceTally;
}

interface CourseRecord {
  id: string;
  title: string;
  code: string;
  lecturer: string | null;
  is_completed: boolean | null;
  assignments: GradeEntry[];
  courseAvg: number | null;
}

import { getLetterGrade } from "@/lib/grading";
import { EMPTY_TALLY, tallyAttendance, type AttendanceTally } from "@/lib/attendance";
import { fetchCountedSessionIds } from "@/lib/attendance-queries";
import { fetchStudentHistory } from "@/lib/student-sessions";


const StudentTranscript = () => {
  const { student, profile } = useAuth();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceTally>(EMPTY_TALLY);
  const [cohortName, setCohortName] = useState("");
  // Sessions the student has been through before this one — they were moved
  // into their current cohort rather than made to register again, so the work
  // they did back then is still theirs and belongs on the transcript.
  const [pastSessions, setPastSessions] = useState<SessionRecord[]>([]);
  const [previousCodes, setPreviousCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const loadTranscript = useCallback(async () => {
    if (!student?.id || !student?.cohort_id) return;
    try {
      setLoading(true);

      const [coursesRes, subsRes, attRes, cohortRes, examsRes] = await Promise.all([
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
          .select("status, schedule_id, is_verified")
          .eq("student_id", student.id),
        supabase
          .from("cohorts")
          .select("name")
          .eq("id", student.cohort_id)
          .single(),
        // Exams sit against a course just as assignments do, so a released
        // result belongs in that course's record. Without this the transcript
        // reported a student's standing from coursework alone.
        supabase
          .from("exam_attempts")
          .select("id, score, manual_score_override, graded_at, max_points, exam:exams(id, title, assessment_type, total_points, course_id, results_released)")
          .eq("student_id", student.id)
          .in("status", ["submitted", "graded"]),
      ]);

      if (cohortRes.data) setCohortName(cohortRes.data.name);

      // Build submissions map by course
      const subsByCourse = new Map<string, typeof subsRes.data>();
      for (const sub of (subsRes.data || [])) {
        const courseId = sub.assignment?.course_id;
        if (!courseId) continue;
        if (!subsByCourse.has(courseId)) subsByCourse.set(courseId, []);
        subsByCourse.get(courseId)!.push(sub);
      }

      // Released results from the exam engine, grouped by the course they belong
      // to. Each one keeps its own label — an Exam, a Test and a Quiz are three
      // separate lines on a transcript, never pooled into one.
      const examsByCourse = new Map<string, GradeEntry[]>();
      for (const att of (examsRes.data || [])) {
        if (!att.exam?.results_released) continue;
        const courseId = att.exam.course_id;
        // A combined paper has no course to sit under, so it stays off the
        // per-course records and their averages. It is still on the student's
        // grades page, which lists results rather than grouping them.
        if (!courseId) continue;
        if (!examsByCourse.has(courseId)) examsByCourse.set(courseId, []);
        examsByCourse.get(courseId)!.push({
          id: att.id,
          title: att.exam.title,
          category: att.exam.assessment_type || "Exam",
          // The attempt's own denominator where it has one: the whole
          // paper is the wrong divisor for a sitting served a subset of it,
          // or marked on only its best few answers.
          max_points: Number(att.max_points ?? att.exam.total_points) || 0,
          grade: Number(att.manual_score_override ?? att.score ?? 0),
          reviewed_at: att.graded_at,
        });
      }

      const buildRecords = (rows: typeof coursesRes.data): CourseRecord[] => (rows || []).map((c) => {
        const subs = (subsByCourse.get(c.id) || []);
        const assignments = [
          ...subs.map((s) => ({
            id: s.assignment?.id || "",
            title: s.assignment?.title || "",
            category: s.assignment?.category || "Assignment",
            max_points: s.assignment?.max_points || 100,
            grade: s.grade,
            reviewed_at: s.reviewed_at,
          })),
          ...(examsByCourse.get(c.id) || []),
        ];

        const graded = assignments.filter((a) => a.grade != null);
        const totalPts = graded.reduce((sum, a) => sum + a.max_points, 0);
        const earnedPts = graded.reduce((sum, a) => sum + (a.grade || 0), 0);
        const courseAvg = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : null;

        return { ...c, assignments, courseAvg };
      });

      setCourses(buildRecords(coursesRes.data));

      // Attendance is measured against the classes the cohort actually held —
      // counting only the rows on file put every transcript near 100%.
      const sessionIds = await fetchCountedSessionIds(student.cohort_id);
      setAttendance(tallyAttendance(sessionIds, attRes.data || []));

      // The same figures for each earlier session, each measured against its own
      // cohort's classes and its own courses.
      const history = await fetchStudentHistory(student.id, student.student_code);
      setPreviousCodes(history.previousCodes);
      const earlier = await Promise.all(
        history.past.map(async (past) => {
          const [{ data: pastCourses }, pastSessionIds] = await Promise.all([
            supabase
              .from("courses")
              .select("id, title, code, lecturer, is_completed")
              .eq("cohort_id", past.cohortId)
              .order("title"),
            fetchCountedSessionIds(past.cohortId),
          ]);
          return {
            cohortId: past.cohortId,
            cohortName: past.cohortName,
            studentCode: past.studentCode,
            courses: buildRecords(pastCourses),
            attendance: tallyAttendance(pastSessionIds, attRes.data || []),
          };
        })
      );
      setPastSessions(earlier);
    } catch (err) {
      console.error("[Transcript] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [student?.id, student?.cohort_id, student?.student_code]);

  useEffect(() => {
    loadTranscript();
  }, [loadTranscript]);


  // Overall GPA calculation
  const gradedCourses = courses.filter(c => c.courseAvg != null);
  const overallAvg = gradedCourses.length > 0
    ? Math.round(gradedCourses.reduce((s, c) => s + c.courseAvg!, 0) / gradedCourses.length)
    : 0;
  const overallGrade = getLetterGrade(overallAvg);
  const completedCount = courses.filter(c => c.is_completed).length;
  // Counts every assessment on the record, coursework and exam-engine sittings
  // alike — a transcript that ignored exam results would understate the work.
  const totalTasks = courses.reduce((s, c) => s + c.assignments.length, 0);
  const gradedTasks = courses.reduce((s, c) => s + c.assignments.filter(a => a.grade != null).length, 0);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6" ref={printRef}>
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
                  {previousCodes.length > 0 && (
                    <p className="text-xs text-muted-foreground font-mono">
                      formerly {previousCodes.join(", ")}
                    </p>
                  )}
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
              <p className="text-xs text-muted-foreground mt-1">Assessments Graded</p>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 text-center">
              <p className={`text-4xl font-black ${attendance.rate == null ? "text-foreground" : attendance.rate >= 75 ? "text-emerald-600" : "text-red-600"}`}>
                {attendance.rate != null ? `${attendance.rate}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Attendance Rate
                {attendance.total > 0 && (
                  <span className="block">of {attendance.total} {attendance.total === 1 ? "class" : "classes"}</span>
                )}
              </p>
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
                          <TableHead className="text-xs">Assessment</TableHead>
                          <TableHead className="hidden text-xs sm:table-cell">Category</TableHead>
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
                              <TableCell className="text-sm">
                                {a.title}
                                {/* On a phone the category rides under the title
                                    rather than taking a column of its own. */}
                                <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                                  {a.category}
                                </span>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="text-[10px]">{a.category}</Badge></TableCell>
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

        {/* Earlier sessions. Kept separate: each has its own courses, its own
            attendance denominator and the code the student held at the time. */}
        {pastSessions.map((session) => (
          <Card key={session.cohortId} className="shadow-[var(--shadow-card)] border-border border-dashed">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" /> {session.cohortName}
                  <Badge variant="outline" className="text-[10px]">Previous session</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {session.studentCode && <span className="font-mono">{session.studentCode} · </span>}
                  Attendance {session.attendance.rate != null ? `${session.attendance.rate}%` : "—"}
                  {session.attendance.total > 0 && ` of ${session.attendance.total}`}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {session.courses.length === 0 ? (
                <p className="text-xs text-muted-foreground">No course records from this session.</p>
              ) : (
                session.courses.map((course) => {
                  const grade = course.courseAvg != null ? getLetterGrade(course.courseAvg) : null;
                  return (
                    <div key={course.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{course.title}</p>
                          <p className="text-xs text-muted-foreground">{course.code}</p>
                        </div>
                        {grade && (
                          <span className={`text-lg font-black shrink-0 ${grade.color}`}>
                            {grade.letter} <span className="text-xs font-medium text-muted-foreground">{course.courseAvg}%</span>
                          </span>
                        )}
                      </div>
                      {course.assignments.filter((a) => a.grade != null).length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {course.assignments.filter((a) => a.grade != null).map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate text-muted-foreground">{a.title}</span>
                              <span className="font-medium shrink-0">{a.grade}/{a.max_points}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        ))}

        {/* Footer note */}
        <div className="text-center text-xs text-muted-foreground print:mt-8">
          <Separator className="mb-4" />
          <p>This transcript was generated from Spirit Life School of Ministry records.</p>
          <p>Generated on {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>
    </>
  );
};

export default StudentTranscript;
