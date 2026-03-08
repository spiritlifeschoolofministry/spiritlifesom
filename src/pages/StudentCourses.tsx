import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { BookOpen, CheckCircle, Clock, User, GraduationCap, Loader } from "lucide-react";

interface Course {
  id: string;
  code: string;
  title: string;
  description: string | null;
  lecturer: string | null;
  is_completed: boolean | null;
  start_date: string | null;
}

const StudentCourses = () => {
  const { student } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!student?.cohort_id) {
          setCourses([]);
          return;
        }

        const { data, error } = await supabase
          .from("courses")
          .select("id, code, title, description, lecturer, is_completed, start_date")
          .eq("cohort_id", student.cohort_id)
          .order("start_date", { ascending: true, nullsFirst: false });

        if (error) throw error;
        setCourses((data as Course[]) || []);
        setError(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load courses";
        console.error("[StudentCourses] Load error:", err);
        setError(msg);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [student?.cohort_id]);

  const completed = courses.filter((c) => c.is_completed);
  const inProgress = courses.filter((c) => !c.is_completed);
  const progressPercent = courses.length > 0 ? Math.round((completed.length / courses.length) * 100) : 0;

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (!courses.length) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center py-12">
          <div className="bg-muted rounded-full p-4 mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">My Courses</h2>
          <p className="text-muted-foreground mb-2 max-w-md">
            No courses have been assigned to your cohort yet.
          </p>
          {error && <p className="text-xs text-destructive max-w-md">{error}</p>}
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Courses</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your academic progress across all enrolled courses
          </p>
        </div>

        {/* Progress Overview Card */}
        <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Course Progress</span>
              </div>
              <span className="text-sm font-bold text-primary">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2.5 mb-3" />
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">{completed.length} Completed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">{inProgress.length} In Progress</span>
              </div>
              <div className="text-muted-foreground ml-auto">{courses.length} Total</div>
            </div>
          </CardContent>
        </Card>

        {/* In Progress Section */}
        {inProgress.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Loader className="w-3.5 h-3.5 text-amber-500" />
              In Progress ({inProgress.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {inProgress.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </div>
        )}

        {/* Completed Section */}
        {completed.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Completed ({completed.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {completed.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

const CourseCard = ({ course }: { course: Course }) => {
  const isDone = course.is_completed;
  const borderColor = isDone ? "border-l-emerald-500" : "border-l-amber-500";
  const bgColor = isDone
    ? "bg-emerald-50/50 dark:bg-emerald-950/10"
    : "bg-amber-50/50 dark:bg-amber-950/10";
  const iconBg = isDone
    ? "bg-emerald-100 dark:bg-emerald-900/30"
    : "bg-amber-100 dark:bg-amber-900/30";
  const iconColor = isDone ? "text-emerald-600" : "text-amber-600";

  return (
    <Card className={`border-l-4 ${borderColor} ${bgColor} shadow-sm hover:shadow-md transition-shadow`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`${iconBg} rounded-lg p-2 shrink-0 mt-0.5`}>
          <BookOpen className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-tight">{course.title}</h3>
              <span className="text-xs font-mono text-muted-foreground">{course.code}</span>
            </div>
            <Badge
              variant="outline"
              className={
                isDone
                  ? "border-emerald-300 text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 shrink-0 text-[10px]"
                  : "border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 shrink-0 text-[10px]"
              }
            >
              {isDone ? (
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Done</span>
              ) : (
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Ongoing</span>
              )}
            </Badge>
          </div>
          {course.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{course.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {course.lecturer || "TBA"}
            </span>
            {course.start_date && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(course.start_date + "T00:00:00").toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentCourses;
