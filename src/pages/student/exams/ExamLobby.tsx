import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from '@/integrations/supabase/types';

type ExamWithCourse = Tables<'exams'> & { courses: { code: string; title: string } | null };
import { useAuth } from "@/contexts/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { entryClosesAt, formatDuration } from "@/lib/exam-utils";
import { fullscreenSupported, requestFullscreen } from "@/lib/fullscreen";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ExamLobby() {
  const { id } = useParams();
  const { student } = useAuth();
  const nav = useNavigate();
  const [exam, setExam] = useState<ExamWithCourse | null>(null);
  // Null until known; falls back to the exam's own total, which is right for
  // every paper where all questions count.
  const [markedOutOf, setMarkedOutOf] = useState<number | null>(null);
  // This student's own window, where staff have granted them one.
  const [myWindow, setMyWindow] = useState<{ start_at: string; end_at: string; overridden: boolean } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [isMobile] = useState(/Mobi|Android|iPhone|iPad/.test(navigator.userAgent));
  const [camera, setCamera] = useState<"idle" | "checking" | "granted" | "denied">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mic, setMic] = useState<"idle" | "checking" | "granted" | "denied">("idle");
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("exams").select("*, courses(code, title)").eq("id", id).maybeSingle();
      setExam(data);
      // Reaching this page is the last thing a student does before pressing
      // Start, so it is the moment worth recording: everything after it is
      // already logged by exam-start, and everything before it was invisible.
      if (data) {
        void supabase.rpc("log_exam_access", {
          p_event: "opened",
          p_exam_id: id!,
          p_detail: null,
          p_user_agent: navigator.userAgent,
        });
      }
      // The times this student is working to. exam-start asks the same
      // function before it will let anyone in, so the page cannot promise a
      // deadline the runner would refuse.
      const { data: w } = await supabase.rpc("exam_window_for", { p_exam_id: id! });
      const resolved = Array.isArray(w) ? w[0] : w;
      if (resolved) setMyWindow(resolved);

      // What this paper is actually marked out of. exams.total_points is every
      // question on it, which overstates the mark available whenever only the
      // best few count — a student told to answer two of three would be
      // promised 45 points and then marked out of 30.
      if (data?.count_best_n) {
        const { data: qs } = await supabase
          .from("exam_question_paper")
          .select("points")
          .eq("exam_id", id!);
        if (qs?.length) {
          setMarkedOutOf(
            qs
              .map((q) => Number(q.points) || 0)
              .sort((a, b) => b - a)
              .slice(0, data.count_best_n!)
              .reduce((sum, n) => sum + n, 0),
          );
        }
      }
      setLoading(false);
    })();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [id]);

  /**
   * Prove the camera actually works before the exam can be entered.
   *
   * The proctor component used to ask once the paper was already open, and a
   * refusal only greyed out a badge — the exam carried on unwatched. Asking
   * here means a refusal stops the start instead.
   *
   * The probe stream is stopped immediately; this is a permission check, not
   * the recording session, and leaving it open would sit the camera light on
   * through the rules page and fight the proctor for the device.
   */
  const requestCamera = useCallback(async () => {
    setCamera("checking");
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((t) => t.stop());
      setCamera("granted");
    } catch (e) {
      setCamera("denied");
      setCameraError(
        e?.name === "NotFoundError"
          ? "No camera was found on this device."
          : e?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser's site settings, then try again."
            : e?.message || "The camera could not be started.",
      );
    }
  }, []);

  /**
   * The same proof for the microphone. Recording starts with the paper, so a
   * refusal has to stop the start rather than leave the exam half-monitored.
   *
   * The probe stream is stopped immediately, for the same reason as the camera:
   * this is a permission check, not the recording session.
   */
  const requestMic = useCallback(async () => {
    setMic("checking");
    setMicError(null);
    try {
      if (typeof MediaRecorder === "undefined") {
        throw Object.assign(new Error("This browser cannot record audio. Use Chrome, Edge, Firefox or Safari."), { name: "Unsupported" });
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach((t) => t.stop());
      setMic("granted");
    } catch (e) {
      setMic("denied");
      setMicError(
        e?.name === "NotFoundError"
          ? "No microphone was found on this device."
          : e?.name === "NotAllowedError"
            ? "Microphone access was blocked. Allow it in your browser's site settings, then try again."
            : e?.message || "The microphone could not be started.",
      );
    }
  }, []);

  // Ask as soon as the rules are on screen, so a student sorts the camera out
  // before the clock is running rather than after.
  useEffect(() => {
    if (exam?.enable_webcam_proctoring && camera === "idle") {
      requestCamera();
    }
  }, [exam?.enable_webcam_proctoring, camera, requestCamera]);

  // Asked after the camera has settled. Two getUserMedia calls in flight at
  // once stack prompts on top of each other, and on some browsers the second
  // is dismissed unanswered.
  useEffect(() => {
    if (!exam?.enable_audio_proctoring || mic !== "idle") return;
    if (exam?.enable_webcam_proctoring && (camera === "idle" || camera === "checking")) return;
    requestMic();
  }, [exam?.enable_audio_proctoring, exam?.enable_webcam_proctoring, camera, mic, requestMic]);

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!exam) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-2">
        <p className="text-base font-bold">Exam not found</p>
        <Link to="/student/exams" className="text-sm font-semibold text-primary">Back to Exams</Link>
      </div>
    );
  }

  // A student with a concession works to their own window; everyone else works
  // to the paper's. exam-start resolves the same way, so the countdown on this
  // page and the answer from the runner always agree.
  const startMs = new Date(myWindow?.start_at ?? exam.start_at).getTime();
  const endMs = new Date(myWindow?.end_at ?? exam.end_at).getTime();
  const beforeStart = now < startMs;
  const afterEnd = now > endMs;
  const secondsToStart = Math.max(0, Math.floor((startMs - now) / 1000));
  // Entry can shut well before the exam does. Reading the same rule the server
  // enforces is what stops this page offering a Start button that only
  // dead-ends in the runner with a 403.
  // Late-entry is measured from this student's own opening time, not the
  // paper's — otherwise a concession granted for Friday would have its entry
  // cutoff computed from Thursday morning and shut before it opened.
  const entryClosesMs = entryClosesAt({
    ...exam,
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
  });
  const entryClosed = !beforeStart && now > entryClosesMs;

  // Support is a property of the browser, not of this render — but it is read
  // during render, so it is computed here rather than held in state.
  const canFullscreen = fullscreenSupported();
  const cameraRequired = !!exam.enable_webcam_proctoring;
  const cameraReady = !cameraRequired || camera === "granted";
  const micRequired = !!exam.enable_audio_proctoring;
  const micReady = !micRequired || mic === "granted";
  const canStart =
    !beforeStart && !afterEnd && !entryClosed && agreed && (!isMobile || exam.allow_mobile) && cameraReady && micReady;

  const startExam = async () => {
    if (!canStart) return;
    // A refusal here is recoverable — the runner offers the student a way back
    // in. A device with no fullscreen at all is not, and the runner knows to
    // stop enforcing rather than covering the paper with an overlay that can
    // never be dismissed.
    if (exam.enforce_fullscreen) await requestFullscreen();
    nav(`/student/exams/${id}/take`);
  };

  // Before opening, the countdown sits above the button; the button just says
  // what it will do.
  const startLabel = beforeStart
    ? "Start exam"
    : afterEnd
      ? "Window closed"
      : entryClosed
        ? "Entry closed"
        : !cameraReady
          ? "Camera required"
          : !micReady
            ? "Microphone required"
            : "Start exam";

  // "Before you start": what this paper's own settings ask of the student and
  // this device, each with a mark — ready, worth knowing, or blocking.
  type Mark = "ok" | "warn" | "bad" | "wait";
  const checks: { key: string; mark: Mark; text: React.ReactNode; detail?: React.ReactNode; retry?: () => void }[] = [];
  if (isMobile && !exam.allow_mobile) {
    checks.push({ key: "device", mark: "bad", text: "This exam requires a desktop browser. Mobile devices are not allowed." });
  } else if (isMobile) {
    checks.push({ key: "device", mark: "warn", text: "You're on mobile. Some security protections are reduced. We recommend a laptop." });
  }
  if (cameraRequired) {
    checks.push({
      key: "camera",
      mark: camera === "granted" ? "ok" : camera === "denied" ? "bad" : "wait",
      text:
        camera === "granted"
          ? `Camera ready: snapshots every ${exam.snapshot_interval_seconds ?? 30}s for your lecturer to review`
          : camera === "checking"
            ? "Checking your camera…"
            : "Camera access is required for this exam",
      detail:
        camera === "granted"
          ? "You are being recorded by snapshot throughout this exam."
          : cameraError || "This exam is proctored. You cannot start until the camera is working.",
      retry: camera === "denied" ? requestCamera : undefined,
    });
  }
  if (micRequired) {
    checks.push({
      key: "mic",
      mark: mic === "granted" ? "ok" : mic === "denied" ? "bad" : "wait",
      text:
        mic === "granted"
          ? `Microphone ready: recorded in ${exam.audio_clip_seconds ?? 60}s clips for your lecturer to review`
          : mic === "checking"
            ? "Checking your microphone…"
            : "Microphone access is required for this exam",
      detail:
        mic === "granted"
          ? "Your audio is recorded throughout this exam."
          : micError || "This exam is audio-monitored. You cannot start until the microphone is working.",
      retry: mic === "denied" ? requestMic : undefined,
    });
  }
  if (exam.enforce_fullscreen && canFullscreen) {
    checks.push({
      key: "fullscreen",
      mark: "warn",
      text: `Fullscreen required: leaving it ${exam.max_fullscreen_exits} times submits the exam`,
      detail: "Leaving fullscreen hides your questions until you return, and the clock keeps running.",
    });
  }
  if (exam.enforce_fullscreen && !canFullscreen) {
    checks.push({
      key: "fullscreen",
      mark: "warn",
      text: "This exam is normally sat in fullscreen, which your device does not support",
      detail: "iPhones and iPads have no fullscreen mode for web pages. You can sit the paper as normal; leaving the app is still recorded.",
    });
  }
  checks.push({
    key: "tabs",
    mark: "warn",
    text: `Switching tabs or windows is counted (limit ${exam.max_tab_switches})`,
    detail: `After ${exam.max_tab_switches} switches your exam is submitted automatically.`,
  });
  if (exam.block_shortcuts) {
    checks.push({ key: "shortcuts", mark: "warn", text: "Copy, paste, right-click and developer tools are disabled" });
  }

  const MARK_STYLE: Record<Mark, { cls: string; label: string; icon: React.ReactNode }> = {
    ok: { cls: "bg-[#157F5B] text-white", label: "Ready", icon: <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> },
    warn: { cls: "bg-[#E0A526] text-[#17112B]", label: "Note", icon: <span aria-hidden="true">!</span> },
    bad: { cls: "bg-[#C2410C] text-white", label: "Blocked", icon: <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> },
    wait: { cls: "bg-[#3A3254] text-white", label: "Checking", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> },
  };

  const rules = [
    <>Once you start, the exam <strong className="text-white">cannot be paused</strong>. You must finish in {exam.duration_minutes} minutes.</>,
    <>Questions are shown <strong className="text-white">one at a time</strong>{exam.randomize_questions ? " in random order" : ""}.</>,
    <>You have <strong className="text-white">only one attempt</strong>.</>,
    <>Your answers <strong className="text-white">save every {exam.autosave_interval_seconds}s</strong>. If your connection drops or your browser crashes, reopen the app and you will continue where you stopped.</>,
    <>You can only be logged in <strong className="text-white">on one device</strong>. A second login will block your active session.</>,
    <>Results are released by your lecturer. Don't expect an immediate score.</>,
  ];

  const facts = [
    { v: `${exam.duration_minutes} min`, l: "time limit" },
    { v: String(markedOutOf ?? exam.total_points), l: exam.count_best_n ? `marks · best ${exam.count_best_n} count` : "marks" },
    { v: `${exam.passing_score}%`, l: "pass mark" },
    { v: String(exam.max_tab_switches), l: "tab switches allowed" },
  ];

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex flex-col gap-[18px] rounded-[24px] bg-[#17112B] p-5 text-white dark:border dark:border-white/10 sm:p-6">
        <Link
          to="/student/exams"
          aria-label="Back to Exams"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#3A3254] text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>

        <div className="space-y-1.5">
          <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#E0A526]">
            {exam.assessment_type || "Exam"} · {exam.courses ? exam.courses.code : "All courses"}
          </p>
          <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-tight">{exam.title}</h1>
          {exam.courses?.title && <p className="text-sm text-[#CFC9DE]">{exam.courses.title}</p>}
          {exam.description && <p className="pt-1 text-sm leading-relaxed text-[#CFC9DE]">{exam.description}</p>}
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.l} className="flex flex-col-reverse gap-0.5 rounded-[14px] bg-[#241C3D] p-3">
              <dt className="text-xs text-[#CFC9DE]">{f.l}</dt>
              <dd className="text-xl font-extrabold tracking-tight">{f.v}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="lobby-window" className="space-y-1 rounded-[18px] bg-[#241C3D] p-4 text-[13px] text-[#CFC9DE]">
          <h2 id="lobby-window" className="text-[15px] font-bold text-white">Window</h2>
          <p>
            Opens {format(new Date(startMs), "PPpp")} · Closes {format(new Date(endMs), "PPpp")}
          </p>
          {myWindow?.overridden && (
            <p className="font-semibold text-[#E0A526]">
              These times were set for you by your lecturer — they are not the same as the rest of your class.
            </p>
          )}
          {/* Entry usually shuts before the exam does, and a student who does
              not know that only finds out by being turned away. */}
          {entryClosesMs < endMs && (
            <p className={entryClosed ? "font-semibold text-[#FDBA9A]" : undefined}>
              {entryClosed
                ? `Entry closed ${format(new Date(entryClosesMs), "PPpp")} — ask your lecturer if you need to be let in.`
                : `You must start by ${format(new Date(entryClosesMs), "PPpp")}.`}
            </p>
          )}
        </section>

        <section aria-labelledby="lobby-checks" className="space-y-3 rounded-[18px] bg-[#241C3D] p-4">
          <h2 id="lobby-checks" className="text-[15px] font-bold">Before you start</h2>
          <ul className="space-y-3">
            {checks.map((c) => {
              const m = MARK_STYLE[c.mark];
              return (
                <li key={c.key} className="flex items-start gap-3">
                  <span className={cn("mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold", m.cls)}>
                    {m.icon}
                    <span className="sr-only">{m.label}: </span>
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm text-[#E9E5F2]">{c.text}</p>
                    {c.detail && <p className="text-xs text-[#CFC9DE]">{c.detail}</p>}
                    {c.retry && (
                      <button
                        type="button"
                        onClick={c.retry}
                        className="mt-1 min-h-11 rounded-xl border border-[#3A3254] px-4 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {exam.instructions && (
          <section aria-labelledby="lobby-instructions" className="space-y-1.5 rounded-[18px] bg-[#241C3D] p-4">
            <h2 id="lobby-instructions" className="text-[15px] font-bold">From your lecturer</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#E9E5F2]">{exam.instructions}</p>
          </section>
        )}

        <section aria-labelledby="lobby-rules" className="space-y-2">
          <h2 id="lobby-rules" className="text-[15px] font-bold">How this paper works</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-[#CFC9DE] marker:text-[#E0A526]">
            {rules.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>

        <div className="flex items-start gap-3 rounded-[14px] border border-[#3A3254] p-3">
          <Checkbox
            id="agree"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(!!v)}
            className="mt-0.5 h-5 w-5 border-[#CFC9DE] data-[state=checked]:border-[#E0A526] data-[state=checked]:bg-[#E0A526] data-[state=checked]:text-[#17112B] focus-visible:ring-[#E0A526] focus-visible:ring-offset-[#17112B]"
          />
          <Label htmlFor="agree" className="cursor-pointer text-sm font-normal leading-relaxed text-[#E9E5F2]">
            I have read and agree to follow all the rules above. I understand that violations may result in auto-submission and disciplinary action.
          </Label>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          {beforeStart && (
            <p className="text-center text-sm text-[#CFC9DE]" aria-live="off">
              Starts in <strong className="font-mono text-white">{formatDuration(secondsToStart)}</strong>
            </p>
          )}
          <button
            type="button"
            disabled={!canStart}
            onClick={startExam}
            className="h-[54px] rounded-2xl bg-[#E0A526] text-base font-extrabold text-[#17112B] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#17112B] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {startLabel}
          </button>
          <Link
            to="/student/exams"
            className="flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-[#CFC9DE] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
