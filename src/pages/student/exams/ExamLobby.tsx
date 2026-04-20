import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import StudentLayout from "@/components/StudentLayout";
import { AlertTriangle, Clock, ShieldAlert, Monitor, Smartphone } from "lucide-react";
import { formatDuration } from "@/lib/exam-utils";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ExamLobby() {
  const { id } = useParams();
  const { student } = useAuth();
  const nav = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [isMobile] = useState(/Mobi|Android|iPhone|iPad/.test(navigator.userAgent));

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams").select("*, courses(code, title)").eq("id", id).maybeSingle();
      setExam(data);
      setLoading(false);
    })();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [id]);

  if (loading) return <StudentLayout><p className="p-6">Loading…</p></StudentLayout>;
  if (!exam) return <StudentLayout><p className="p-6">Exam not found</p></StudentLayout>;

  const startMs = new Date(exam.start_at).getTime();
  const endMs = new Date(exam.end_at).getTime();
  const beforeStart = now < startMs;
  const afterEnd = now > endMs;
  const secondsToStart = Math.max(0, Math.floor((startMs - now) / 1000));

  const canStart = !beforeStart && !afterEnd && agreed && (!isMobile || exam.allow_mobile);

  const startExam = async () => {
    if (!canStart) return;
    if (exam.enforce_fullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
    }
    nav(`/student/exams/${id}/take`);
  };

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-6">
          <Badge variant="outline" className="mb-2">{exam.courses?.code} · {exam.courses?.title}</Badge>
          <h1 className="text-2xl font-bold">{exam.title}</h1>
          {exam.description && <p className="text-sm text-muted-foreground mt-2">{exam.description}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="font-bold">{exam.duration_minutes} min</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground">Total points</p>
              <p className="font-bold">{exam.total_points}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground">Pass mark</p>
              <p className="font-bold">{exam.passing_score}%</p>
            </div>
            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-xs text-muted-foreground">Tab switches allowed</p>
              <p className="font-bold">{exam.max_tab_switches}</p>
            </div>
          </div>

          <div className="mt-5 p-4 rounded-md bg-amber-500/5 border border-amber-500/20">
            <p className="text-sm font-medium mb-1 flex items-center gap-2"><Clock className="w-4 h-4" /> Window</p>
            <p className="text-xs text-muted-foreground">
              Opens {format(new Date(exam.start_at), "PPpp")} · Closes {format(new Date(exam.end_at), "PPpp")}
            </p>
            {beforeStart && (
              <p className="mt-2 text-2xl font-mono font-bold text-primary">{formatDuration(secondsToStart)}</p>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-bold mb-3 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Rules &amp; Regulations</h2>
          {exam.instructions && (
            <div className="text-sm text-foreground whitespace-pre-wrap mb-4 p-3 bg-muted/40 rounded">{exam.instructions}</div>
          )}
          <ul className="text-sm space-y-2 list-disc pl-5">
            <li>Once you start, the exam <strong>cannot be paused</strong>. You must finish in {exam.duration_minutes} minutes.</li>
            <li>Questions are shown <strong>one at a time</strong>{exam.randomize_questions ? " in random order" : ""}.</li>
            <li>You have <strong>only one attempt</strong>.</li>
            {exam.enforce_fullscreen && <li>The exam will run in <strong>fullscreen</strong>. Exiting fullscreen is recorded.</li>}
            {exam.block_shortcuts && <li>Copy, paste, right-click, and developer tools are <strong>disabled</strong>.</li>}
            <li>Switching tabs/windows is tracked. After <strong>{exam.max_tab_switches} switches</strong> your exam is auto-submitted.</li>
            <li>Your answers <strong>autosave every {exam.autosave_interval_seconds}s</strong>. If your browser crashes, you can resume.</li>
            <li>You can only be logged in <strong>on one device</strong>. A second login will block your active session.</li>
            <li>Results are released by your lecturer. Don't expect an immediate score.</li>
          </ul>

          {isMobile && !exam.allow_mobile && (
            <div className="mt-4 p-3 rounded bg-destructive/10 border border-destructive/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
              <p className="text-sm">This exam requires a desktop browser. Mobile devices are not allowed.</p>
            </div>
          )}
          {isMobile && exam.allow_mobile && (
            <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <Smartphone className="w-4 h-4 text-amber-600 mt-0.5" />
              <p className="text-sm">You're on mobile. Some security protections are reduced. We recommend a laptop.</p>
            </div>
          )}

          <div className="mt-5 flex items-start gap-3 p-3 rounded-md border border-border">
            <Checkbox id="agree" checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} />
            <Label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
              I have read and agree to follow all the rules above. I understand that violations may result in auto-submission and disciplinary action.
            </Label>
          </div>

          <div className="mt-5 flex justify-between items-center gap-3">
            <Button variant="outline" asChild><Link to="/student/exams">Cancel</Link></Button>
            <Button size="lg" disabled={!canStart} onClick={startExam}>
              <Monitor className="w-4 h-4 mr-2" />
              {beforeStart ? `Starts in ${formatDuration(secondsToStart)}` : afterEnd ? "Window closed" : "Start Exam"}
            </Button>
          </div>
        </Card>
      </div>
    </StudentLayout>
  );
}
