import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, CameraOff, AlertTriangle } from "lucide-react";

interface Props {
  attemptId: string;
  examId: string;
  studentId: string;
  intervalSeconds?: number;
}

/**
 * Captures a webcam snapshot every N seconds and uploads to Supabase Storage.
 * Records each upload in the `exam_snapshots` table for admin review.
 */
export default function WebcamProctor({ attemptId, examId, studentId, intervalSeconds = 30 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setActive(true);
      } catch (e: any) {
        setError(e?.message || "Camera blocked");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const capture = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 320, 240);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const path = `${attemptId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("proctor-snapshots")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) return;
        await supabase.from("exam_snapshots").insert({
          attempt_id: attemptId,
          exam_id: examId,
          student_id: studentId,
          storage_path: path,
        });
        setCount((c) => c + 1);
      }, "image/jpeg", 0.7);
    };
    // First capture after 5s, then every interval
    const first = setTimeout(capture, 5000);
    const id = setInterval(capture, Math.max(10, intervalSeconds) * 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active, attemptId, examId, studentId, intervalSeconds]);

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-2 w-40">
      <div className="flex items-center gap-1.5 mb-1">
        {active ? <Camera className="w-3 h-3 text-emerald-500" /> : <CameraOff className="w-3 h-3 text-destructive" />}
        <span className="text-[10px] font-medium text-foreground">Proctoring · {count}</span>
      </div>
      {error ? (
        <div className="flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      ) : (
        <video ref={videoRef} muted playsInline className="w-full rounded bg-muted aspect-[4/3] object-cover" />
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
