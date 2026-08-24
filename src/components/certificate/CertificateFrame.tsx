import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { CERTIFICATE_HEIGHT, CERTIFICATE_WIDTH } from "@/lib/certificate-design";

/**
 * Shows the fixed-size certificate at whatever width is available, by scaling
 * it with a CSS transform rather than by re-laying it out. What is on screen is
 * then the same document that gets exported, only smaller -- which is the point:
 * the previous version re-flowed at every breakpoint, so a student downloading
 * on a phone got a phone-shaped certificate.
 *
 * The forwarded ref is the node to hand to the export functions.
 */
export const CertificateFrame = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(({ children, className }, ref) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    // Never scale past 1:1 -- the artwork is drawn at print size, and blowing it
    // up on a wide monitor only makes it look oversized.
    const measure = () => setScale(Math.min(1, box.clientWidth / CERTIFICATE_WIDTH));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className={`certificate-preview ${className ?? ""}`}
      // The transformed child is out of flow as far as layout is concerned, so
      // the box has to reserve the scaled height itself.
      style={{ width: "100%", height: scale ? CERTIFICATE_HEIGHT * scale : undefined }}
    >
      <div
        ref={ref}
        className="certificate-scale"
        style={{
          width: CERTIFICATE_WIDTH,
          height: CERTIFICATE_HEIGHT,
          transform: `scale(${scale || 1})`,
          transformOrigin: "top left",
          // Hidden until measured, so it never flashes at full size first.
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
});
CertificateFrame.displayName = "CertificateFrame";
