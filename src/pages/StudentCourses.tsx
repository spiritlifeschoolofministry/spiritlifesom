import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, BookOpen, CheckCircle, AlertCircle } from "lucide-react";

interface TimetableEntry {
  id: string;
  date: string;
  dayName: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  lecturer: string | null;
  isCompleted: boolean;
}

const StudentCourses = () => {
  const { student } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!student?.cohort_id) {
          setEntries([]);
          return;
        }

        const { data, error } = await supabase
          .from("schedule")
          .select(
            `
            id,
            date,
            day,
            start_time,
            end_time,
            description,
            courses!inner(
              id,
              title,
              code,
              cohort_id
            )
          `
          )
          .eq("courses.cohort_id", student.cohort_id)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true });

        if (error) throw error;

        const now = new Date();

        const mapped: TimetableEntry[] = (data as any[] | null || []).map((row) => {
          const dateStr: string = row.date;
          const dateObj = new Date(`${dateStr}T00:00:00`);
          const dayName: string =
            row.day || dateObj.toLocaleDateString("en-US", { weekday: "long" });
          const startTime: string | null = row.start_time;
          const endTime: string | null = row.end_time;

          const endDateTime = new Date(
            `${dateStr}T${endTime ?? "23:59:59"}`
          );
          const isCompleted = endDateTime < now;

          return {
            id: row.id,
            date: dateStr,
            dayName,
            startTime,
            endTime,
            title: row.courses?.title || row.description || "Class session",
            // Lecturer information is not modeled yet in the schema,
            // so we show a friendly placeholder.
            lecturer: null,
            isCompleted,
          };
        });

        setEntries(mapped);
        setError(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load timetable";
        console.error("[StudentCourses] Load error:", err);
        setError(msg);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [student?.cohort_id]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>();
    for (const entry of entries) {
      const key = entry.dayName;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entry);
    }
    return map;
  }, [entries]);

  const completed = entries.filter((e) => e.isCompleted);
  const upcoming = entries.filter((e) => !e.isCompleted);

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

  if (!entries.length) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center py-12">
          <div className="bg-muted rounded-full p-4 mb-4">
            <Calendar className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            My Courses & Timetable
          </h2>
          <p className="text-muted-foreground mb-2 max-w-md">
            Your lecture timetable is being finalized by the Admin.
          </p>
          {error && (
            <p className="text-xs text-destructive max-w-md">
              {error}
            </p>
          )}
        </div>
      </StudentLayout>
    );
  }

  const orderedDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              My Courses & Live Timetable
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              View your weekly lecture schedule and track your progress.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Weekly Timetable
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {orderedDays.map((day) => {
                const dayEntries = groupedByDay.get(day) || [];
                if (!dayEntries.length) return null;

                return (
                  <div key={day}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {day}
                    </h3>
                    <div className="space-y-2">
                      {dayEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50"
                        >
                          <div className="mt-0.5">
                            <BookOpen className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {entry.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                              <Clock className="w-3 h-3" />
                              {entry.startTime?.slice(0, 5) ?? "--:--"}{" "}
                              {entry.endTime && `– ${entry.endTime.slice(0, 5)}`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                              <AlertCircle className="w-3 h-3" />
                              Lecturer: {entry.lecturer || "To be announced"}
                            </p>
                          </div>
                          {entry.isCompleted && (
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> Progress Tracker
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-emerald-50 flex flex-col gap-1">
                  <span className="text-xs text-emerald-700 font-medium">
                    Completed Modules
                  </span>
                  <span className="text-2xl font-bold text-emerald-700">
                    {completed.length}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 flex flex-col gap-1">
                  <span className="text-xs text-amber-700 font-medium">
                    Upcoming Modules
                  </span>
                  <span className="text-2xl font-bold text-amber-700">
                    {upcoming.length}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Next Up
                  </h3>
                  {upcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No upcoming modules scheduled.
                    </p>
                  ) : (
                    upcoming.slice(0, 5).map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 rounded-lg bg-secondary/50 mb-2"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {entry.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(entry.date + "T00:00:00").toLocaleDateString(
                            "en-GB",
                            { weekday: "short", day: "numeric", month: "short" }
                          )}{" "}
                          ·{" "}
                          {entry.startTime?.slice(0, 5) ?? "--:--"}
                          {entry.endTime && ` – ${entry.endTime.slice(0, 5)}`}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Recently Completed
                  </h3>
                  {completed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      You have not completed any modules yet.
                    </p>
                  ) : (
                    completed.slice(0, 5).map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 rounded-lg bg-muted mb-2 flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {entry.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(entry.date + "T00:00:00").toLocaleDateString(
                              "en-GB",
                              { weekday: "short", day: "numeric", month: "short" }
                            )}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentCourses;

