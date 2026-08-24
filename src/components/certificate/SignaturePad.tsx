import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Upload } from "lucide-react";
import { toast } from "sonner";
import { MAX_SIGNATURE_BYTES, dataUrlBytes } from "@/lib/signature-image";

// Drawn at a comfortable resolution rather than the display size: the signature
// prints 54px tall on the certificate, which the 3x export turns into 162px, so
// the stored image needs to be at least that.
const PAD_WIDTH = 600;
const PAD_HEIGHT = 200;
const STROKE = 3.5;

/**
 * Crops a canvas to the ink actually on it.
 *
 * Without this the stored PNG is mostly transparent margin, and the certificate
 * renders the signature to a fixed height -- so the visible mark ends up tiny
 * and floating wherever in the box it happened to be drawn.
 */
const trimToInk = (source: HTMLCanvasElement): string => {
  const ctx = source.getContext("2d");
  if (!ctx) return source.toDataURL("image/png");

  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return "";

  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")?.drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
};

type Props = {
  /** PNG data URL, or empty for no signature. */
  value: string;
  onChange: (dataUrl: string) => void;
  label: string;
};

/**
 * Captures a signature either drawn with a mouse or finger, or uploaded as a
 * scan. Emits a trimmed PNG data URL.
 */
export const SignaturePad = ({ value, onChange, label }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const context = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    ctx.strokeStyle = "#101828";
    ctx.lineWidth = STROKE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  };

  // Show whatever is already stored, so editing a cohort does not look like it
  // has no signature until you draw a new one.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) {
      setHasInk(false);
      return;
    }

    const img = new Image();
    img.onload = () => {
      // Fit the stored image inside the pad without distorting it.
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      setHasInk(true);
    };
    img.src = value;
  }, [value]);

  const positionOf = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // The canvas is displayed smaller than its pixel size, so CSS coordinates
    // have to be scaled up or the stroke lands away from the pointer.
    const point = "touches" in e ? e.touches[0] : e;
    return {
      x: (point.clientX - rect.left) * (canvas.width / rect.width),
      y: (point.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = context();
    if (!ctx) return;
    const { x, y } = positionOf(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = context();
    if (!ctx) return;
    const { x, y } = positionOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  };

  const end = () => {
    // Only commit if a stroke actually happened -- otherwise leaving the pad
    // with the mouse would overwrite a stored signature with a blank one.
    if (!drawing.current) return;
    drawing.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(trimToInk(canvas));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange("");
  };

  const upload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Redraw through the pad so an upload is stored the same way a drawing
        // is: trimmed to its ink and no larger than the pad.
        const scratch = document.createElement("canvas");
        const scale = Math.min(PAD_WIDTH / img.width, PAD_HEIGHT / img.height, 1);
        scratch.width = Math.round(img.width * scale);
        scratch.height = Math.round(img.height * scale);
        scratch.getContext("2d")?.drawImage(img, 0, 0, scratch.width, scratch.height);

        const trimmed = trimToInk(scratch);
        if (dataUrlBytes(trimmed) > MAX_SIGNATURE_BYTES) {
          toast.error("That image is too detailed for a signature. A scan on a white background works best.");
          return;
        }
        onChange(trimmed);
      };
      img.onerror = () => toast.error("That image could not be read");
      img.src = String(reader.result);
    };
    reader.onerror = () => toast.error("That file could not be read");
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </label>
        {hasInk && (
          <span className="text-[10px] text-muted-foreground">
            {Math.round(dataUrlBytes(value) / 1024)} KB
          </span>
        )}
      </div>

      <div className="rounded-md border border-border bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          className="block w-full cursor-crosshair"
          style={{ height: 110, touchAction: "none" }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
          <label>
            <Upload className="w-3.5 h-3.5" /> Upload scan
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                // Let the same file be chosen again after a failure.
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
          onClick={clear}
          disabled={!hasInk}
        >
          <Eraser className="w-3.5 h-3.5" /> Clear
        </Button>
        <span className="text-[10px] text-muted-foreground ml-auto">Draw above, or upload a scan</span>
      </div>
    </div>
  );
};
