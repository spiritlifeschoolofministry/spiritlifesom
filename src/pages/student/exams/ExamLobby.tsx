import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from '@/integrations/supabase/types';

type ExamWithCourse = Tables<'exams'> & { courses: { code: string; title: string } | null };
import { useAuth } from "@/contexts/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Camera, CameraOff, Clock, ShieldAlert, Monitor, Smartphone, Mic, MicOff } from "lucide-react";
import { entryClosesAt, formatDuration } from "@/lib/exam-utils";
import { format } from "date-fns";
import { toast } from "sonner";

export default function ExamLobby() {
  const { id } = useParams();
  const { student } = useAuth();
  const nav = useNavigate();
  const [exam, setExam] = useState<ExamWithCourse | null>(null);
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

  if (loading) return <p className="p-6">Loading…</p>;
  if (!exam) return <p className="p-6">Exam not found</p>;

  const startMs = new Date(exam.start_at).getTime();
  const endMs = new Date(exam.end_at).getTime();
  const beforeStart = now < startMs;
  const afterEnd = now > endMs;
  const secondsToStart = Math.max(0, Math.floor((startMs - now) / 1000));
  // Entry can shut well before the exam does. Reading the same rule the server
  // enforces is what stops this page offering a Start button that only
  // dead-ends in the runner with a 403.
  const entryClosesMs = entryClosesAt(exam);
  const entryClosed = !beforeStart && now > entryClosesMs;

  const cameraRequired = !!exam.enable_webcam_proctoring;
  const cameraReady = !cameraRequired || camera === "granted";
  const micRequired = !!exam.enable_audio_proctoring;
  const micReady = !micRequired || mic === "granted";
  const canStart =
    !beforeStart && !afterEnd && !entryClosed && agreed && (!isMobile || exam.allow_mobile) && cameraReady && micReady;

  const startExam = async () => {
    if (!canStart) return;
    if (exam.enforce_fullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
    }
    nav(`/student/exams/${id}/take`);
  };

  return (
    <>
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
            {/* Entry usually shuts before the exam does, and a student who does
                not know that only finds out by being turned away. */}
            {entryClosesMs < endMs && (
              <p className={`text-xs mt-1 ${entryClosed ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {entryClosed
                  ? `Entry closed ${format(new Date(entryClosesMs), "PPpp")} — ask your lecturer if you need to be let in.`
                  : `You must start by ${format(new Date(entryClosesMs), "PPpp")}.`}
              </p>
            )}
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
            {exam.enforce_fullscreen && <li>The exam will run in <strong>fullscreen</strong>. Leaving fullscreen hides your questions until you return, the clock keeps running, and after {exam.max_fullscreen_exits} exits your exam is submitted automatically.</li>}
            {exam.block_shortcuts && <li>Copy, paste, right-click, and developer tools are <strong>disabled</strong>.</li>}
            {exam.enable_webcam_proctoring && <li>Your <strong>webcam is required</strong> and takes snapshots every {exam.snapshot_interval_seconds ?? 30}s for your lecturer to review.</li>}
            {exam.enable_audio_proctoring && <li>Your <strong>microphone is required</strong> and is recorded in {exam.audio_clip_seconds ?? 60}s clips throughout the exam for your lecturer to review.</li>}
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

          {cameraRequired && (
            <div
              className={`mt-4 p-3 rounded border flex items-start gap-2 ${
                camera === "granted"
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : camera === "denied"
                    ? "bg-destructive/10 border-destructive/20"
                    : "bg-muted/40 border-border"
              }`}
            >
              {camera === "granted" ? (
                <Camera className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <CameraOff className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {camera === "granted"
                    ? "Camera ready"
                    : camera === "checking"
                      ? "Checking your camera…"
                      : "Camera access is required for this exam"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {camera === "granted"
                    ? "You are being recorded by snapshot throughout this exam."
                    : cameraError || "This exam is proctored. You cannot start until the camera is working."}
                </p>
                {camera === "denied" && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={requestCamera}>
                    Try again
                  </Button>
                )}
              </div>
            </div>
          )}

          {micRequired && (
            <div
              className={`mt-4 p-3 rounded border flex items-start gap-2 ${
                mic === "granted"
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : mic === "denied"
                    ? "bg-destructive/10 border-destructive/20"
                    : "bg-muted/40 border-border"
              }`}
            >
              {mic === "granted" ? (
                <Mic className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <MicOff className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {mic === "granted"
                    ? "Microphone ready"
                    : mic === "checking"
                      ? "Checking your microphone…"
                      : "Microphone access is required for this exam"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {mic === "granted"
                    ? "Your audio is recorded throughout this exam."
                    : micError || "This exam is audio-monitored. You cannot start until the microphone is working."}
                </p>
                {mic === "denied" && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={requestMic}>
                    Try again
                  </Button>
                )}
              </div>
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
              {beforeStart
                ? `Starts in ${formatDuration(secondsToStart)}`
                : afterEnd
                  ? "Window closed"
                : entryClosed
                  ? "Entry closed"
                  : !cameraReady
                    ? "Camera required"
                    : !micReady
                      ? "Microphone required"
                      : "Start Exam"}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
