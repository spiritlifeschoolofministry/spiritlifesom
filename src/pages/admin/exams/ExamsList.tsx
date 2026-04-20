import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Edit, Activity, BookOpen } from "lucide-react";
import { format } from "date-fns";

export default function ExamsList() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("exams")
        .select("*, courses(code,title), cohorts(name)")
        .order("start_at", { ascending: false });
      setExams(data ?? []);
      setLoading(false);
    })();
  }, []);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-muted text-muted-foreground",
      published: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      closed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    };
    return <Badge variant="outline" className={map[s] || ""}>{s}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Online Exams</h1>
          <p className="text-sm text-muted-foreground">Create, monitor and grade course exams</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/exams/questions"><BookOpen className="w-4 h-4 mr-1.5" /> Question Bank</Link>
          </Button>
          <Button asChild>
            <Link to="/admin/exams/new"><Plus className="w-4 h-4 mr-1.5" /> New Exam</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : exams.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No exams yet.</Card>
      ) : (
        <div className="grid gap-3">
          {exams.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold">{e.title}</h3>
                    {statusBadge(e.status)}
                    {e.results_released && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">Released</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.courses?.code} · {e.cohorts?.name} · {e.duration_minutes} min · {e.total_points} pts
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Starts {format(new Date(e.start_at), "PPp")} → Ends {format(new Date(e.end_at), "PPp")}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" asChild title="Edit">
                    <Link to={`/admin/exams/${e.id}/edit`}><Edit className="w-4 h-4" /></Link>
                  </Button>
                  <Button variant="ghost" size="icon" asChild title="Monitor">
                    <Link to={`/admin/exams/${e.id}/monitor`}><Activity className="w-4 h-4" /></Link>
                  </Button>
                  <Button variant="ghost" size="icon" asChild title="Preview">
                    <Link to={`/admin/exams/${e.id}/edit?tab=preview`}><Eye className="w-4 h-4" /></Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
