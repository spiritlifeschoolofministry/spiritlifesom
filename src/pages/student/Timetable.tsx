import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CalendarClock, ChevronLeft, ChevronRight, Clock, BookOpen, MapPin } from "lucide-react";

interface ScheduleEntry {
  id: string;
  date: string;
  day: string | null;
  start_time: string | null;
  end_time: string | null;
  activity_type: string | null;
  description: string | null;
  course_title: string | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const StudentTimetable = () => {
  const { student } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  useEffect(() => {
    loadSchedule();
  }, [student?.cohort_id, weekStart]);

  const loadSchedule = async () => {
    if (!student?.cohort_id) { setLoading(false); return; }
    try {
      setLoading(true);
      const startStr = weekStart.toISOString().split("T")[0];
      const endStr = weekEnd.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("schedule")
        .select("id, date, day, start_time, end_time, activity_type, description, courses(title, cohort_id)")
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date")
        .order("start_time");

      if (error) throw error;

      // Filter to entries relevant to student's cohort or general (no course)
      const entries: ScheduleEntry[] = ((data || []) as any[])
        .filter((s: any) => !s.courses || s.courses.cohort_id === student.cohort_id)
        .map((s: any) => ({
          id: s.id,
          date: s.date,
          day: s.day,
          start_time: s.start_time,
          end_time: s.end_time,
          activity_type: s.activity_type,
          description: s.description,
          course_title: s.courses?.title || null,
        }));

      setSchedule(entries);
    } catch (err) {
      console.error("[Timetable] Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const goToWeek = (delta: number) => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  };

  const goToToday = () => setWeekStart(getWeekStart(new Date()));

  const isCurrentWeek = getWeekStart(new Date()).getTime() === weekStart.getTime();

  // Group by day
  const byDay = DAYS.map((dayName, i) => {
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + i);
    const dateStr = dayDate.toISOString().split("T")[0];
    const isToday = new Date().toISOString().split("T")[0] === dateStr;
    const entries = schedule.filter((s) => s.date === dateStr);
    return { dayName, date: dayDate, dateStr, isToday, entries };
  });

  const activityColor: Record<string, string> = {
    Lecture: "bg-primary/10 text-primary border-primary/20",
    Practical: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    Orientation: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-12 w-full" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="w-7 h-7" /> Timetable
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Your weekly class schedule.</p>
        </div>

        {/* Week Navigation */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-3 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => goToWeek(-1)}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="font-semibold text-sm text-foreground">
                {formatDate(weekStart)} – {formatDate(weekEnd)}
              </p>
              {!isCurrentWeek && (
                <button onClick={goToToday} className="text-xs text-primary hover:underline mt-0.5">
                  Go to this week
                </button>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => goToWeek(1)}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </CardContent>
        </Card>

        {/* Days */}
        <div className="space-y-3">
          {byDay.map(({ dayName, date, isToday, entries }) => (
            <Card
              key={dayName}
              className={`shadow-[var(--shadow-card)] border-border transition-colors ${isToday ? "ring-2 ring-primary/30" : ""}`}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">{dayName}</CardTitle>
                  <span className="text-xs text-muted-foreground">{formatDate(date)}</span>
                  {isToday && <Badge className="text-[10px] h-5 bg-primary text-primary-foreground">Today</Badge>}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {entries.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No scheduled activities</p>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${activityColor[entry.activity_type || ""] || "bg-secondary/50 border-border"}`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {entry.course_title ? <BookOpen className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">
                            {entry.course_title || entry.description || entry.activity_type || "Class"}
                          </p>
                          {entry.description && entry.course_title && (
                            <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-1.5">
                            {(entry.start_time || entry.end_time) && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {entry.start_time?.slice(0, 5) || "—"} – {entry.end_time?.slice(0, 5) || "—"}
                              </span>
                            )}
                            {entry.activity_type && (
                              <Badge variant="outline" className="text-[10px] h-5">{entry.activity_type}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentTimetable;
