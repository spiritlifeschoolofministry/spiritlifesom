import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProjectResult, overallWithProject, type ProjectResult } from "@/lib/project-result";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Printer } from "lucide-react";
import { EmptyCard, Panel, Pill, ScreenHeader, SectionTitle, StatTile } from "@/components/redesign/student-pages/ui";
import { cn } from "@/lib/utils";

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
  const [project, setProject] = useState<ProjectResult | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const loadTranscript = useCallback(async () => {
    if (!student?.id || !student?.cohort_id) return;
    try {
      setLoading(true);
      // Its own line on the record, beside the courses rather than under one.
      setProject(await fetchMyProjectResult(student.id).catch(() => null));

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
  // The project counts on its own: one more unit with the same weight as a course.
  const overallAvg = overallWithProject(gradedCourses.map((c) => c.courseAvg!), project?.percent ?? null);
  const overallGrade = getLetterGrade(overallAvg);
  const completedCount = courses.filter(c => c.is_completed).length;
  // Counts every assessment on the record, coursework and exam-engine sittings
  // alike — a transcript that ignored exam results would understate the work.
  const totalTasks = courses.reduce((s, c) => s + c.assignments.length, 0) + (project ? 1 : 0);
  const gradedTasks = courses.reduce((s, c) => s + c.assignments.filter(a => a.grade != null).length, 0) + (project?.percent != null ? 1 : 0);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-32 rounded-[20px]" />
        <Skeleton className="h-64 rounded-[20px]" />
      </div>
    );
  }

  const rateClass =
    attendance.rate == null ? "" : attendance.rate >= 75 ? "text-[#11603F] dark:text-emerald-300" : "text-[#8E2A0A] dark:text-red-300";

  return (
    <div className="mx-auto max-w-3xl space-y-4" ref={printRef}>
      <ScreenHeader
        title="Academic transcript"
        description="Your complete academic record and performance summary."
        aside={
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> <span>Print or save PDF</span>
          </button>
        }
      />

      {/* Student */}
      <Panel className="overflow-hidden p-0 sm:p-0" aria-label="Student details">
        <div className="h-1.5 gradient-flame" aria-hidden="true" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4 sm:p-5">
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-muted-foreground">Student name</dt>
            <dd className="text-sm font-bold">{profile?.first_name} {profile?.last_name}</dd>
          </div>
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-muted-foreground">Cohort</dt>
            <dd className="text-sm font-bold">{cohortName || "—"}</dd>
          </div>
          <div className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-muted-foreground">Student code</dt>
            <dd className="text-sm font-bold">
              <span className="font-mono">{student?.student_code || "—"}</span>
              {previousCodes.length > 0 && (
                <span className="block font-mono text-xs font-normal text-muted-foreground">
                  formerly {previousCodes.join(", ")}
                </span>
              )}
            </dd>
          </div>
          <div className="flex flex-col-reverse gap-1">
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd><Pill tone="info">{student?.admission_status || "—"}</Pill></dd>
          </div>
        </dl>
      </Panel>

      {/* Performance summary */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Performance summary">
        <StatTile
          className="py-3"
          value={<>{overallGrade.letter} <span className="text-sm font-bold text-muted-foreground">{overallAvg}%</span></>}
          valueClassName={overallGrade.color}
          label="Overall grade"
        />
        <StatTile className="py-3" value={`${completedCount}/${courses.length}`} label="Courses completed" />
        <StatTile className="py-3" value={`${gradedTasks}/${totalTasks}`} label="Assessments graded" />
        <StatTile
          className="py-3"
          value={attendance.rate != null ? `${attendance.rate}%` : "—"}
          valueClassName={rateClass}
          label={attendance.total > 0 ? `Attendance of ${attendance.total} ${attendance.total === 1 ? "class" : "classes"}` : "Attendance"}
        />
      </dl>

      {/* Course by course */}
      <section aria-labelledby="transcript-courses" className="space-y-2.5">
        <SectionTitle id="transcript-courses">Courses</SectionTitle>
        {courses.length === 0 && (
          <EmptyCard icon={<BookOpen className="h-6 w-6" aria-hidden="true" />} title="No courses found for your cohort" />
        )}
        {courses.map((course) => {
          const grade = course.courseAvg != null ? getLetterGrade(course.courseAvg) : null;
          return (
            <article key={course.id} className="break-inside-avoid overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold leading-snug">{course.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {course.code}{course.lecturer ? ` · ${course.lecturer}` : ""}
                  </p>
                  <Pill tone={course.is_completed ? "success" : "info"} className="mt-1.5">
                    {course.is_completed ? "Completed" : "In progress"}
                  </Pill>
                </div>
                {grade && (
                  <div className="shrink-0 text-right">
                    <span className={cn("text-2xl font-black leading-none", grade.color)}>{grade.letter}</span>
                    <p className="text-xs text-muted-foreground">{course.courseAvg}% · {grade.label}</p>
                  </div>
                )}
              </div>
              {course.assignments.length > 0 ? (
                <ul className="divide-y divide-[#F1EFF6] border-t border-[#F1EFF6] dark:divide-border dark:border-border">
                  {course.assignments.map((a) => {
                    const pct = a.grade != null ? Math.round((a.grade / a.max_points) * 100) : null;
                    const lg = pct != null ? getLetterGrade(pct) : null;
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                        <span className="min-w-0">
                          <span className="block text-sm">{a.title}</span>
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{a.category}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2.5 text-sm">
                          {a.grade != null ? <span className="font-semibold">{a.grade}/{a.max_points}</span> : <span className="text-muted-foreground">—</span>}
                          {lg
                            ? <span className={cn("w-4 text-center font-black", lg.color)}>{lg.letter}</span>
                            : <span className="text-xs text-muted-foreground">Pending</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="border-t border-[#F1EFF6] px-3.5 py-2.5 text-xs text-muted-foreground dark:border-border">
                  No tasks submitted for this course.
                </p>
              )}
            </article>
          );
        })}
      </section>

      {/* The final project: counted on its own, not under a course. */}
      {project && (
        <section aria-labelledby="transcript-project" className="space-y-2.5">
          <SectionTitle id="transcript-project">Project</SectionTitle>
          <article className="break-inside-avoid rounded-2xl border border-border bg-card p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold leading-snug">{project.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {[project.isGroup ? "Group project" : "Individual project", project.outcome ?? "Result pending"].join(" · ")}
                </p>
              </div>
              {project.percent !== null ? (
                <span className={cn("shrink-0 text-lg font-black", getLetterGrade(project.percent).color)}>
                  {getLetterGrade(project.percent).letter}{" "}
                  <span className="text-xs font-medium text-muted-foreground">{project.percent}%</span>
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">Pending</span>
              )}
            </div>
          </article>
        </section>
      )}

      {/* Earlier sessions. Kept separate: each has its own courses, its own
          attendance denominator and the code the student held at the time. */}
      {pastSessions.map((session) => (
        <section key={session.cohortId} aria-label={`${session.cohortName}, previous session`} className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {session.cohortName} · previous session
            </h2>
            <span className="text-xs text-muted-foreground">
              {session.studentCode && <span className="font-mono">{session.studentCode} · </span>}
              Attendance {session.attendance.rate != null ? `${session.attendance.rate}%` : "—"}
              {session.attendance.total > 0 && ` of ${session.attendance.total}`}
            </span>
          </div>
          {session.courses.length === 0 ? (
            <Panel className="border-dashed text-xs text-muted-foreground">No course records from this session.</Panel>
          ) : (
            session.courses.map((course) => {
              const grade = course.courseAvg != null ? getLetterGrade(course.courseAvg) : null;
              const graded = course.assignments.filter((a) => a.grade != null);
              return (
                <div key={course.id} className="break-inside-avoid rounded-2xl border border-dashed border-border bg-card p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{course.title}</p>
                      <p className="text-xs text-muted-foreground">{course.code}</p>
                    </div>
                    {grade && (
                      <span className={cn("shrink-0 text-lg font-black", grade.color)}>
                        {grade.letter} <span className="text-xs font-medium text-muted-foreground">{course.courseAvg}%</span>
                      </span>
                    )}
                  </div>
                  {graded.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {graded.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-muted-foreground">{a.title}</span>
                          <span className="shrink-0 font-semibold">{a.grade}/{a.max_points}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </section>
      ))}

      {/* Footer note */}
      <div className="border-t border-border pt-4 text-center text-xs text-muted-foreground print:mt-8">
        <p>This transcript was generated from Spirit Life School of Ministry records.</p>
        <p>Generated on {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
    </div>
  );
};

export default StudentTranscript;
