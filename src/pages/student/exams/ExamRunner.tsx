import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from '@/integrations/supabase/types';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import WebcamProctor from "@/components/exam/WebcamProctor";
import AudioProctor from "@/components/exam/AudioProctor";
import { formatDuration, generateFingerprint, generateSessionId, isAnswered } from "@/lib/exam-utils";
import { edgeErrorMessage } from "@/lib/edge-error";
import { AlertTriangle, ChevronLeft, ChevronRight, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

/** How long a student has to restore a lost camera or microphone. */
const GRACE_SECONDS = 10;

export default function ExamRunner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Tables<'exams'> | null>(null);
  const [attempt, setAttempt] = useState<Tables<'exam_attempts'> | null>(null);
  const [questions, setQuestions] = useState<Tables<'exam_question_paper'>[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  // Set while the student is outside fullscreen on an exam that requires it:
  // the paper is covered until they come back.
  const [fullscreenBlocked, setFullscreenBlocked] = useState(false);
  const [fullscreenExits, setFullscreenExits] = useState(0);
  // Filled in when a submission could not be recorded. The sitting stays locked
  // rather than dropping the student back on the exam list, which is what let a
  // failed auto-submit be shrugged off and the paper resumed.
  const [submitFailed, setSubmitFailed] = useState<string | null>(null);
  const [deviceGrace, setDeviceGrace] = useState<{ device: string; reason: string; secondsLeft: number } | null>(null);
  // Bumped when a device comes back, to remount the proctors onto a fresh stream.
  const [proctorEpoch, setProctorEpoch] = useState(0);
  const sessionIdRef = useRef(generateSessionId());
  // Mirrors of the answer state, so the autosave callback can stay stable.
  const answersRef = useRef<Record<string, unknown>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const submittedRef = useRef(false);
  // Counters read by the event handlers. State alone went stale inside the
  // listeners, which is how the third tab switch could be counted as the first.
  const tabSwitchesRef = useRef(0);
  const fullscreenExitsRef = useRef(0);
  // One grace window per device: a revoked camera fires several signals, and
  // each must not restart the countdown.
  const gracedDevicesRef = useRef<Set<string>>(new Set());
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
        toast.error(await edgeErrorMessage(error, data, "Could not start exam"));
        navigate("/student/exams");
        return;
      }
      const att = data.attempt;
      setAttempt(att);

      const qIds = att.question_order ?? [];
      // exam_question_paper, not question_bank: the bank is staff-only under RLS
      // and carries the answer key. The view exposes just the sittable columns.
      const { data: qs } = await supabase
        .from("exam_question_paper")
        .select("*")
        .eq("exam_id", id!)
        .in("id", qIds);
      const ordered = qIds.map((qid: string) => qs?.find((q) => q.id === qid)).filter(Boolean);
      setQuestions(ordered);

      // Load saved answers
      const { data: saved } = await supabase.from("exam_answers").select("*").eq("attempt_id", att.id);
      const map: Record<string, unknown> = {};
      (saved ?? []).forEach((a) => { map[a.question_id] = a.answer; });
      answersRef.current = map;
      setAnswers(map);
      tabSwitchesRef.current = att.tab_switch_count ?? 0;
      fullscreenExitsRef.current = att.fullscreen_exits ?? 0;
      setTabSwitches(tabSwitchesRef.current);
      setFullscreenExits(fullscreenExitsRef.current);
      // The lobby asks for fullscreen on the click that starts the exam, but the
      // browser can refuse it. Gate the paper rather than opening it anyway.
      if (e.enforce_fullscreen && !document.fullscreenElement) setFullscreenBlocked(true);
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
  //
  // Reads pending work from refs rather than state on purpose. With `answers`
  // and `dirty` as dependencies this callback changed identity on every
  // keystroke, which tore down and recreated the interval below — so a student
  // answering steadily kept restarting the countdown and the autosave never
  // fired at all.
  const autosave = useCallback(async (
    event?: { type: string; data?: unknown },
    opts?: { force?: boolean },
  ) => {
    if (!attempt) return;
    if (submittedRef.current && !opts?.force) return;
    const dirtyIds = Array.from(dirtyRef.current);
    const payload = dirtyIds.map((qid) => ({
      question_id: qid,
      answer: answersRef.current[qid],
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
    if (!error && !data?.error) {
      // Clear only what this call actually saved; anything answered while the
      // request was in flight has to stay pending.
      const remaining = new Set(dirtyRef.current);
      dirtyIds.forEach((qid) => remaining.delete(qid));
      dirtyRef.current = remaining;
      setDirty(remaining);
    }
    // The server counts the breaches, so it decides when a sitting is over: its
    // counters survive a reload, and the client's do not.
    if (data?.limit_exceeded?.reason) {
      toast.error(`${data.limit_exceeded.message} — submitting your exam`);
      await submitExam(data.limit_exceeded.reason);
    }
    return data;
    // eslint-disable-next-line
  }, [attempt, navigate]);

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
        if (submittedRef.current) return;
        const next = tabSwitchesRef.current + 1;
        tabSwitchesRef.current = next;
        setTabSwitches(next);
        // The submission itself is driven by the server's reply to this call —
        // it holds the authoritative count. Warn locally in the meantime.
        autosave({ type: "tab_switch", data: { count: next } });
        if (next < exam.max_tab_switches) {
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
      // Submitting leaves fullscreen by design, and the browser fires this
      // before the page changes — so the student was told off for exiting
      // fullscreen as their paper went in. Only flag it while the exam is live.
      if (submittedRef.current) return;
      if (!exam.enforce_fullscreen) return;

      if (!document.fullscreenElement) {
        // Leaving fullscreen now has a consequence. It used to be recorded and
        // warned about and nothing else, so a student could drop out of
        // fullscreen on the first question and sit the rest of the paper with
        // the rest of their desktop in view. The questions are covered until
        // they come back, the exit is counted, and the count is what the server
        // measures against the limit.
        const next = fullscreenExitsRef.current + 1;
        fullscreenExitsRef.current = next;
        setFullscreenExits(next);
        setFullscreenBlocked(true);
        autosave({ type: "fullscreen_exit", data: { count: next } });
        toast.error(`You left fullscreen (${next}/${exam.max_fullscreen_exits}). Return to fullscreen to carry on.`);
      } else {
        setFullscreenBlocked(false);
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
  }, [exam, autosave]);

  const updateAnswer = (qid: string, val: unknown) => {
    answersRef.current = { ...answersRef.current, [qid]: val };
    dirtyRef.current = new Set(dirtyRef.current).add(qid);
    setAnswers(answersRef.current);
    setDirty(dirtyRef.current);
  };

  /**
   * Losing a required device ends the exam — but not instantly.
   *
   * Entry is gated on the camera and microphone working, so carrying on without
   * one would let a student switch it off the moment the paper opened and sit
   * the rest unmonitored. Submitting on the first dropped signal was too harsh
   * the other way: a device grabbed by another app, or a laptop waking from
   * sleep, ended an otherwise honest sitting. So the student is told what
   * happened and given GRACE_SECONDS to put it right. The device is retried
   * throughout that window, so plugging the camera back in or re-allowing it
   * picks the sitting straight back up; only if the window runs out is the
   * exam submitted, with the reason recorded.
   */
  const beginDeviceGrace = useCallback((device: string, reason: string) => {
    if (submittedRef.current) return;
    if (gracedDevicesRef.current.has(device)) return;
    gracedDevicesRef.current.add(device);
    toast.error(`${reason}. Restore it within ${GRACE_SECONDS}s or your exam will be submitted.`);
    setDeviceGrace({ device, reason, secondsLeft: GRACE_SECONDS });
  }, []);

  const handleCameraLost = useCallback((reason: string) => {
    beginDeviceGrace("camera", reason);
  }, [beginDeviceGrace]);

  /**
   * Losing the microphone is treated exactly as losing the camera: entry was
   * gated on it working.
   */
  const handleMicLost = useCallback((reason: string) => {
    beginDeviceGrace("microphone", reason);
  }, [beginDeviceGrace]);

  const submitExam = async (reason: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    // Forced, because the guard above has already been set: without this the
    // flush returned immediately and every answer since the last autosave —
    // in practice all of them — was lost.
    await autosave(undefined, { force: true });

    // Retried, because this is the call that ends the sitting. A single failed
    // attempt used to be reported in a toast and then the student was sent back
    // to the exam list, where the paper — still open in the database — offered
    // itself for resuming: an auto-submission for cheating became a warning the
    // student could click past.
    let lastError: string | null = null;
    for (let attemptNo = 0; attemptNo < 3; attemptNo++) {
      if (attemptNo > 0) await new Promise((r) => setTimeout(r, 1000 * attemptNo));
      const { data, error } = await supabase.functions.invoke("exam-submit", {
        body: { attempt_id: attempt.id, reason },
      });
      const failure = data?.success ? null : await edgeErrorMessage(error, data, "Submission failed");
      // An attempt already closed server-side is a success from here.
      if (!failure || /already submitted/i.test(failure)) {
        toast.success("Exam submitted");
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        navigate("/student/exams");
        return;
      }
      lastError = failure;
      console.error("exam-submit failed:", lastError);
    }

    // Still not recorded. Stay on this screen: the paper is closed to the
    // student either way, and the next exam-start will finish the attempt off.
    setSubmitting(false);
    setSubmitFailed(lastError);
    toast.error("Your exam could not be submitted. Do not close this page.");
  };

  // Keep trying the lost device for as long as the countdown runs.
  //
  // Ten seconds is not long enough to reload a page, and it should not have to
  // be: if the camera comes back — the app that grabbed it released it, the
  // cable went back in, the permission was re-allowed — the sitting simply
  // continues. The proctors are remounted so they pick up a live stream again.
  useEffect(() => {
    if (!deviceGrace) return;
    let cancelled = false;
    const probe = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          deviceGrace.device === "camera" ? { video: true } : { audio: true },
        );
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled || submittedRef.current) return;
        gracedDevicesRef.current.delete(deviceGrace.device);
        setDeviceGrace(null);
        setProctorEpoch((n) => n + 1);
        toast.success(`${deviceGrace.device === "camera" ? "Camera" : "Microphone"} restored — carry on.`);
      } catch {
        // Still gone. The countdown in the effect below keeps running.
      }
    };
    probe();
    const t = setInterval(probe, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [deviceGrace]);

  // Runs the grace countdown, then submits. Kept as an effect rather than a
  // timeout inside beginDeviceGrace so the remaining seconds can be shown, and
  // so a submission from any other cause cancels it.
  useEffect(() => {
    if (!deviceGrace) return;
    if (deviceGrace.secondsLeft <= 0) {
      submitExam(deviceGrace.device === "camera" ? "camera_blocked" : "microphone_blocked");
      setDeviceGrace(null);
      return;
    }
    const t = setTimeout(() => {
      if (submittedRef.current) { setDeviceGrace(null); return; }
      setDeviceGrace((g) => (g ? { ...g, secondsLeft: g.secondsLeft - 1 } : g));
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceGrace]);

  if (!exam || !attempt || !questions.length) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p>Loading exam…</p></div>;
  }

  // A submission that could not be recorded ends the sitting here rather than
  // sending the student back to a list where the paper is still resumable.
  if (submitFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <h1 className="text-lg font-bold">Your exam is closed</h1>
          <p className="text-sm text-muted-foreground">
            Your answers were saved, but this device could not record the submission ({submitFailed}). Your attempt is
            finished — show this screen to your invigilator or contact your lecturer. Do not start the exam again.
          </p>
          <Button variant="outline" onClick={() => navigate("/student/exams")}>Back to my exams</Button>
        </Card>
      </div>
    );
  }

  const current = questions[idx];
  const optOrder = (attempt.option_orders as Record<string, number[]>)?.[current.id] ?? null;
  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const progress = (answeredCount / questions.length) * 100;
  const urgent = secondsLeft < 300;

  return (
    <div className="min-h-screen bg-background select-none" onCopy={(e) => e.preventDefault()}>
      {exam.enable_webcam_proctoring && (
        <WebcamProctor
          key={`cam-${proctorEpoch}`}
          onCameraLost={handleCameraLost}
          attemptId={attempt.id}
          examId={exam.id}
          studentId={attempt.student_id}
          intervalSeconds={exam.snapshot_interval_seconds ?? 30}
        />
      )}
      {exam.enable_audio_proctoring && (
        <AudioProctor
          key={`mic-${proctorEpoch}`}
          onMicLost={handleMicLost}
          attemptId={attempt.id}
          examId={exam.id}
          studentId={attempt.student_id}
          clipSeconds={exam.audio_clip_seconds ?? 60}
        />
      )}
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{exam.title}</p>
            <p className="text-[10px] text-muted-foreground">
              Q {idx + 1}/{questions.length} · Tab switches: {tabSwitches}/{exam.max_tab_switches}
              {exam.enforce_fullscreen && ` · Fullscreen exits: ${fullscreenExits}/${exam.max_fullscreen_exits}`}
            </p>
          </div>
          <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums ${urgent ? "text-destructive animate-pulse" : "text-primary"}`}>
            {formatDuration(secondsLeft)}
          </div>
        </div>
        <Progress value={progress} className="h-1 rounded-none" />
      </header>

      {fullscreenBlocked && exam.enforce_fullscreen && (
        <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-sm flex items-center justify-center p-6">
          <Card className="max-w-md p-6 text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-destructive mx-auto" />
            <h1 className="text-lg font-bold">Return to fullscreen</h1>
            <p className="text-sm text-muted-foreground">
              This exam must be sat in fullscreen. Your questions are hidden until you go back, and{" "}
              <strong>the clock is still running</strong>. Leaving fullscreen {exam.max_fullscreen_exits} time
              {exam.max_fullscreen_exits === 1 ? "" : "s"} submits your exam automatically — you have used{" "}
              {fullscreenExits}.
            </p>
            <Button
              onClick={() => document.documentElement.requestFullscreen().catch(() => {
                toast.error("Your browser refused fullscreen. Allow it and try again.");
              })}
            >
              Re-enter fullscreen
            </Button>
          </Card>
        </div>
      )}

      {deviceGrace && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <p className="text-sm">
            <strong>{deviceGrace.reason}.</strong> This exam requires your {deviceGrace.device}. Turn it back on and
            the exam carries on by itself — your answers are saved. Submitting in {deviceGrace.secondsLeft}s.
          </p>
        </div>
      )}

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
              const answered = isAnswered(q, answers[q.id]);
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
