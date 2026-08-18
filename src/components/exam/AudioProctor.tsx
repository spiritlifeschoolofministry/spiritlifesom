import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, MicOff, AlertTriangle } from "lucide-react";
import { r2Storage } from "@/lib/r2-storage";

interface Props {
  attemptId: string;
  examId: string;
  studentId: string;
  /** Length of each recorded clip. Clamped to a 15s floor. */
  clipSeconds?: number;
  /** Called when the microphone stops during the exam, for whatever reason. */
  onMicLost?: (reason: string) => void;
}

/**
 * Candidate containers, best first. Chrome/Firefox record Opus in WebM; Safari
 * only offers MP4/AAC. An unsupported string passed to MediaRecorder throws, so
 * the list is probed rather than assumed.
 */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Records the student's microphone in fixed-length clips and uploads each one
 * to Cloudflare R2, recording it in `exam_audio_clips` for admin review.
 *
 * A fresh MediaRecorder is used per clip rather than one long recording split
 * by timeslice: only the first timeslice chunk carries the container header, so
 * the later ones would not play on their own.
 */
export default function AudioProctor({ attemptId, examId, studentId, clipSeconds = 60, onMicLost }: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Report the loss once. A revoked microphone fires several signals at once
    // (track ended, permission change, the liveness poll), and each would
    // otherwise trigger a separate submission.
    let reported = false;
    const lose = (reason: string) => {
      if (cancelled || reported) return;
      reported = true;
      setActive(false);
      setError(reason);
      onMicLost?.(reason);
    };

    (async () => {
      if (!pickMimeType()) {
        lose("This browser cannot record audio");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Left on: the point is an audible record of the room, and the
          // browser's own cleanup makes speech easier to make out.
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setActive(true);

        // Covers the microphone being unplugged, taken by another app, or
        // switched off at the OS level — the track simply ends.
        stream.getAudioTracks().forEach((track) => {
          track.addEventListener("ended", () => lose("Microphone was turned off"));
        });
      } catch (e: any) {
        lose(e?.message || "Microphone blocked");
      }
    })();

    // Covers permission being revoked in the browser's site settings, which
    // does not always end the track on its own.
    let permission: PermissionStatus | null = null;
    const onPermissionChange = () => {
      if (permission?.state === "denied") lose("Microphone permission was withdrawn");
    };
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        permission = status;
        status.addEventListener("change", onPermissionChange);
      })
      .catch(() => {/* Firefox has no microphone permission query; the track handler covers it. */});

    return () => {
      cancelled = true;
      permission?.removeEventListener("change", onPermissionChange);
      if (recorderRef.current?.state === "recording") {
        try { recorderRef.current.stop(); } catch { /* already torn down */ }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A stopped track that never fired `ended` still has to be caught, so poll
  // its liveness the way the webcam proctor does.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const track = streamRef.current?.getAudioTracks()[0];
      if (!track || track.readyState === "ended" || !track.enabled) {
        setActive(false);
        setError("Microphone stopped");
        onMicLost?.("Microphone stopped");
      }
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Live input meter. Purely for the student: it shows the microphone really is
  // picking sound up, so a muted headset is noticed before the exam is over.
  useEffect(() => {
    if (!active || !streamRef.current) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(streamRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    const id = setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (const v of buffer) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 90));
    }, 150);
    return () => {
      clearInterval(id);
      source.disconnect();
      ctx.close().catch(() => {});
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const stream = streamRef.current;
    const mimeType = pickMimeType();
    if (!stream || !mimeType) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lengthMs = Math.max(15, clipSeconds) * 1000;

    const upload = async (blob: Blob) => {
      if (blob.size === 0) return;
      const ext = extensionFor(mimeType);
      const fileName = `proctoring-audio/${attemptId}/${Date.now()}.${ext}`;
      const row = {
        attempt_id: attemptId,
        exam_id: examId,
        student_id: studentId,
        storage_path: fileName,
        mime_type: mimeType,
        duration_seconds: Math.round(lengthMs / 1000),
        bytes: blob.size,
      };

      try {
        const file = new File([blob], fileName.split("/").pop()!, { type: blob.type || mimeType });
        await r2Storage.uploadFile(file, fileName);
        await supabase.from("exam_audio_clips").insert({ ...row, storage_provider: "r2" });
        setCount((c) => c + 1);
      } catch (err) {
        console.error("R2 audio upload failed, falling back to Supabase:", err);
        const { error: upErr } = await supabase.storage
          .from("proctor-audio")
          .upload(fileName, blob, { contentType: blob.type || mimeType, upsert: false });
        if (!upErr) {
          await supabase.from("exam_audio_clips").insert({ ...row, storage_provider: "supabase" });
          setCount((c) => c + 1);
        }
      }
    };

    const recordOne = () => {
      if (stopped) return;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      } catch (e) {
        console.error("MediaRecorder could not start:", e);
        return;
      }
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        // Upload and immediately begin the next clip, so the gap between them
        // is the length of a stop/start rather than the length of an upload.
        if (!stopped) recordOne();
        upload(new Blob(chunks, { type: mimeType }));
      };
      recorder.start();
      timer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, lengthMs);
    };

    recordOne();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      const recorder = recorderRef.current;
      // Stopping flushes the part-recorded clip through `onstop`, so the last
      // stretch before a submission is kept rather than dropped.
      if (recorder?.state === "recording") {
        try { recorder.stop(); } catch { /* already torn down */ }
      }
    };
  }, [active, attemptId, examId, studentId, clipSeconds]);

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-card border border-border rounded-lg shadow-lg p-2 w-40">
      <div className="flex items-center gap-1.5 mb-1">
        {active ? <Mic className="w-3 h-3 text-emerald-500" /> : <MicOff className="w-3 h-3 text-destructive" />}
        <span className="text-[10px] font-medium text-foreground">Audio · {count}</span>
      </div>
      {error ? (
        <div className="flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      ) : (
        <div className="h-1.5 rounded bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-150"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
