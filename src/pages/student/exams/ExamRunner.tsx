import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import WebcamProctor from "@/components/exam/WebcamProctor";
import { formatDuration, generateFingerprint, generateSessionId } from "@/lib/exam-utils";
import { AlertTriangle, ChevronLeft, ChevronRight, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function ExamRunner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const sessionIdRef = useRef(generateSessionId());
  const submittedRef = useRef(false);
  const questionStartRef = useRef(Date.now());

  // --- Load + start ---
  useEffect(() => {
    (async () => {
      const { data: e } = await supabase.from("exams").select("*").eq("id", id).maybeSingle();
      if (!e) { toast.error("Exam not found"); navigate("/student/exams"); return; }
      setExam(e);

      const { data, error } = await supabase.functions.invoke("exam-start", {
        body: {
          exam_id: id,
          session_id: sessionIdRef.current,
          device_fingerprint: generateFingerprint(),
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Could not start exam");
        navigate("/student/exams");
        return;
      }
      const att = data.attempt;
      setAttempt(att);

      const qIds = att.question_order ?? [];
      const { data: qs } = await supabase.from("question_bank").select("*").in("id", qIds);
      const ordered = qIds.map((qid: string) => qs?.find((q) => q.id === qid)).filter(Boolean);
      setQuestions(ordered);

      // Load saved answers
      const { data: saved } = await supabase.from("exam_answers").select("*").eq("attempt_id", att.id);
      const map: Record<string, unknown> = {};
      (saved ?? []).forEach((a) => { map[a.question_id] = a.answer; });
      setAnswers(map);
      setTabSwitches(att.tab_switch_count ?? 0);
    })();
  }, [id, navigate]);

  // --- Server-driven countdown ---
  useEffect(() => {
    if (!attempt) return;
    const calc = () => {
      const remain = Math.floor((new Date(attempt.server_deadline_at).getTime() - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, remain));
      if (remain <= 0 && !submittedRef.current) submitExam("timeout");
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [attempt]);

  // --- Autosave loop ---
  const autosave = useCallback(async (event?: { type: string; data?: unknown }) => {
    if (!attempt || submittedRef.current) return;
    const dirtyIds = Array.from(dirty);
    const payload = dirtyIds.map((qid) => ({
      question_id: qid,
      answer: answers[qid],
      time_spent_seconds: 0,
    }));
    const { data, error } = await supabase.functions.invoke("exam-autosave", {
      body: { attempt_id: attempt.id, session_id: sessionIdRef.current, answers: payload, event },
    });
    if (data?.session_conflict) {
      setWarning("Another session has taken over this exam.");
      submittedRef.current = true;
      navigate("/student/exams");
      return;
    }
    if (data?.expired) {
      submitExam("timeout");
      return;
    }
    if (!error && !data?.error) setDirty(new Set());
    // eslint-disable-next-line
  }, [attempt, answers, dirty, navigate]);

  useEffect(() => {
    if (!exam) return;
    const interval = setInterval(() => autosave(), (exam.autosave_interval_seconds ?? 15) * 1000);
    return () => clearInterval(interval);
  }, [exam, autosave]);

  // --- Anti-cheat handlers ---
  useEffect(() => {
    if (!exam) return;

    const onVisibility = () => {
      if (document.hidden) {
        const next = tabSwitches + 1;
        setTabSwitches(next);
        autosave({ type: "tab_switch", data: { count: next } });
        if (next >= exam.max_tab_switches) {
          toast.error("Tab switch limit exceeded — submitting");
          submitExam("tab_switch_exceeded");
        } else {
          setWarning(`Warning: ${next}/${exam.max_tab_switches} tab switches used. Exam will auto-submit at the limit.`);
        }
      }
    };

    const onCopy = (e: Event) => { e.preventDefault(); toast.warning("Copy disabled"); };
    const onContext = (e: Event) => { e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (!exam.block_shortcuts) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "p", "s", "u"].includes(k)) {
        e.preventDefault(); toast.warning("Shortcut disabled");
      }
      if (k === "f12" || (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k))) {
        e.preventDefault(); toast.warning("Devtools blocked");
      }
    };
    const onFsChange = () => {
      if (exam.enforce_fullscreen && !document.fullscreenElement) {
        autosave({ type: "fullscreen_exit" });
        setWarning("You exited fullscreen. Please return to fullscreen to continue.");
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!submittedRef.current) {
        e.preventDefault(); e.returnValue = "";
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line
  }, [exam, tabSwitches, autosave]);

  const updateAnswer = (qid: string, val: unknown) => {
    setAnswers((p) => ({ ...p, [qid]: val }));
    setDirty((d) => new Set(d).add(qid));
  };

  const submitExam = async (reason: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    await autosave();
    const { data, error } = await supabase.functions.invoke("exam-submit", {
      body: { attempt_id: attempt.id, reason },
    });
    if (error || data?.error) toast.error(data?.error || error?.message);
    else toast.success("Exam submitted");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate("/student/exams");
  };

  if (!exam || !attempt || !questions.length) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p>Loading exam…</p></div>;
  }

  const current = questions[idx];
  const optOrder = (attempt.option_orders as Record<string, number[]>)?.[current.id] ?? null;
  const answeredCount = questions.filter((q) => answers[q.id] != null && answers[q.id] !== "").length;
  const progress = (answeredCount / questions.length) * 100;
  const urgent = secondsLeft < 300;

  return (
    <div className="min-h-screen bg-background select-none" onCopy={(e) => e.preventDefault()}>
      {exam.enable_webcam_proctoring && (
        <WebcamProctor
          attemptId={attempt.id}
          examId={exam.id}
          studentId={attempt.student_id}
          intervalSeconds={exam.snapshot_interval_seconds ?? 30}
        />
      )}
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{exam.title}</p>
            <p className="text-[10px] text-muted-foreground">Q {idx + 1}/{questions.length} · Tab switches: {tabSwitches}/{exam.max_tab_switches}</p>
          </div>
          <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums ${urgent ? "text-destructive animate-pulse" : "text-primary"}`}>
            {formatDuration(secondsLeft)}
          </div>
        </div>
        <Progress value={progress} className="h-1 rounded-none" />
      </header>

      {warning && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center gap-2 max-w-4xl mx-auto">
          <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{warning}</p>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setWarning(null)}>Dismiss</Button>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-6">
        <Card className="p-6">
          <Badge variant="outline" className="mb-3">Question {idx + 1} of {questions.length} · {current.points} pt</Badge>
          <QuestionRenderer
            question={current}
            optionOrder={optOrder}
            answer={answers[current.id]}
            onChange={(v) => updateAnswer(current.id, v)}
          />
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <Button variant="outline" disabled={idx === 0} onClick={() => { setIdx(idx - 1); questionStartRef.current = Date.now(); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <p className="text-xs text-muted-foreground">Answered {answeredCount}/{questions.length}</p>
          {idx === questions.length - 1 ? (
            <Button onClick={() => {
              if (confirm(`Submit your exam? You answered ${answeredCount} of ${questions.length}.`)) submitExam("manual");
            }} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              <Send className="w-4 h-4 mr-1" /> Submit Exam
            </Button>
          ) : (
            <Button onClick={() => { setIdx(idx + 1); questionStartRef.current = Date.now(); }}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        <Card className="mt-6 p-3">
          <p className="text-xs text-muted-foreground mb-2">Question navigator</p>
          <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
            {questions.map((q, i) => {
              const ans = answers[q.id];
              const answered = ans != null && ans !== "" && !(Array.isArray(ans) && ans.length === 0);
              return (
                <button key={q.id} onClick={() => setIdx(i)}
                  className={`h-8 rounded text-xs font-medium border transition-colors ${
                    i === idx ? "bg-primary text-primary-foreground border-primary" :
                    answered ? "bg-emerald-500/20 border-emerald-500/40 text-foreground" :
                    "bg-muted border-border text-muted-foreground"
                  }`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </Card>
      </main>
    </div>
  );
}
