import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StudentLayout from "@/components/StudentLayout";
import { format, isAfter, isBefore } from "date-fns";

export default function StudentExamsList() {
  const { student } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!student?.cohort_id) return;
    (async () => {
      const { data: ex } = await supabase
        .from("exams")
        .select("*, courses(code,title)")
        .in("status", ["published", "in_progress", "closed"])
        .or(`cohort_id.eq.${student.cohort_id},target_student_ids.cs.{${student.id}}`)
        .order("start_at", { ascending: false });
      setExams(ex ?? []);
      const { data: at } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("student_id", student.id);
      const map: Record<string, any> = {};
      (at ?? []).forEach((a) => { map[a.exam_id] = a; });
      setAttempts(map);
      setLoading(false);
    })();
  }, [student?.id, student?.cohort_id]);

  return (
    <StudentLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">My Exams</h1>
          <p className="text-sm text-muted-foreground">Online assessments for your cohort</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : exams.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">No exams scheduled.</Card>
        ) : (
          <div className="grid gap-3">
            {exams.map((e) => {
              const now = new Date();
              const start = new Date(e.start_at);
              const end = new Date(e.end_at);
              const attempt = attempts[e.id];
              const upcoming = isBefore(now, start);
              const live = !isBefore(now, start) && !isAfter(now, end);
              const closed = isAfter(now, end) || e.status === "closed";

              return (
                <Card key={e.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{e.title}</h3>
                      <p className="text-xs text-muted-foreground">{e.courses?.code} · {e.duration_minutes} min · {e.total_points} pts</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(start, "PPp")} → {format(end, "PPp")}
                      </p>
                      <div className="flex gap-1.5 mt-2">
                        {upcoming && <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Upcoming</Badge>}
                        {live && <Badge variant="outline" className="bg-amber-500/10 text-amber-600 animate-pulse">Live</Badge>}
                        {closed && <Badge variant="outline" className="bg-muted text-muted-foreground">Closed</Badge>}
                        {attempt?.status === "submitted" && <Badge variant="outline" className="bg-blue-500/10 text-blue-600">Submitted</Badge>}
                        {attempt?.status === "graded" && e.results_released && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">Graded</Badge>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!attempt && (live || (upcoming && (start.getTime() - now.getTime()) < 60 * 60_000)) && (
                        <Button asChild><Link to={`/student/exams/${e.id}/lobby`}>Enter</Link></Button>
                      )}
                      {attempt?.status === "in_progress" && live && (
                        <Button asChild><Link to={`/student/exams/${e.id}/take`}>Resume</Link></Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
