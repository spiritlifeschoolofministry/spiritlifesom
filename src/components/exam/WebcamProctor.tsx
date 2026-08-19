import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, CameraOff, AlertTriangle } from "lucide-react";
import { r2Storage } from "@/lib/r2-storage";

interface Props {
  attemptId: string;
  examId: string;
  studentId: string;
  intervalSeconds?: number;
  /** Called when the camera stops during the exam, for whatever reason. */
  onCameraLost?: (reason: string) => void;
}

/**
 * Captures a webcam snapshot every N seconds and uploads to Cloudflare R2.
 * Records each upload in the `exam_snapshots` table for admin review.
 */
export default function WebcamProctor({ attemptId, examId, studentId, intervalSeconds = 30, onCameraLost }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Report the loss once. A revoked camera fires several signals at once
    // (track ended, permission change), and each would otherwise trigger a
    // separate submission.
    let reported = false;
    const lose = (reason: string) => {
      if (cancelled || reported) return;
      reported = true;
      setActive(false);
      setError(reason);
      onCameraLost?.(reason);
    };

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

        // Covers the camera being unplugged, taken by another app, or switched
        // off at the OS level — the track simply ends.
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => lose("Camera was turned off"));
        });
      } catch (e) {
        lose(e?.message || "Camera blocked");
      }
    })();

    // Covers permission being revoked in the browser's site settings, which
    // does not always end the track on its own.
    let permission: PermissionStatus | null = null;
    const onPermissionChange = () => {
      if (permission?.state === "denied") lose("Camera permission was withdrawn");
    };
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        permission = status;
        status.addEventListener("change", onPermissionChange);
      })
      .catch(() => {/* Firefox has no camera permission query; the track handler covers it. */});

    return () => {
      cancelled = true;
      permission?.removeEventListener("change", onPermissionChange);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A stopped stream that never fired `ended` (some browsers on tab throttling)
  // still has to be caught, so poll the track's liveness alongside captures.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended" || !track.enabled) {
        setActive(false);
        setError("Camera stopped");
        onCameraLost?.("Camera stopped");
      }
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

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
        const fileName = `proctoring/${attemptId}/${Date.now()}.jpg`;
        
        try {
          // Upload to R2 instead of Supabase Storage
          const snapshotFile = new File([blob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
          await r2Storage.uploadFile(snapshotFile, fileName);
          
          await supabase.from("exam_snapshots").insert({
            attempt_id: attemptId,
            exam_id: examId,
            student_id: studentId,
            storage_path: fileName,
            storage_provider: 'r2'
          });
          
          setCount((c) => c + 1);
        } catch (err) {
          console.error("R2 upload failed, falling back to Supabase:", err);
          // Fallback to Supabase if R2 is not configured yet or fails
          const { data: upData, error: upErr } = await supabase.storage
            .from("proctor-snapshots")
            .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });
            
          if (!upErr) {
            await supabase.from("exam_snapshots").insert({
              attempt_id: attemptId,
              exam_id: examId,
              student_id: studentId,
              storage_path: fileName,
              storage_provider: 'supabase'
            });
            setCount((c) => c + 1);
          }
        }
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
