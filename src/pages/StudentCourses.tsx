import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, CheckCircle, Clock, User } from "lucide-react";

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

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
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
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Courses</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {courses.length} course{courses.length !== 1 ? "s" : ""} · {completed.length} completed · {inProgress.length} in progress
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-border">
            <CardContent className="p-4 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">Completed</span>
              <span className="text-2xl font-bold text-foreground">{completed.length}</span>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium">In Progress</span>
              <span className="text-2xl font-bold text-foreground">{inProgress.length}</span>
            </CardContent>
          </Card>
        </div>

        {/* Course list */}
        <div className="space-y-3">
          {courses.map((course) => (
            <Card key={course.id} className="border-border shadow-[var(--shadow-card)]">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="bg-primary/10 rounded-lg p-2.5 shrink-0 mt-0.5">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{course.title}</h3>
                    <span className="text-xs font-mono text-muted-foreground">{course.code}</span>
                  </div>
                  {course.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{course.description}</p>
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
                <Badge
                  variant={course.is_completed ? "default" : "secondary"}
                  className={course.is_completed ? "bg-emerald-600 shrink-0" : "shrink-0"}
                >
                  {course.is_completed ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Done
                    </span>
                  ) : (
                    "In Progress"
                  )}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentCourses;
