import { useEffect, useRef } from "react";
import {
  AmbientLight, BoxGeometry, CanvasTexture, DirectionalLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer,
} from "three";
import { cardLines, fitFont, type CardDetails } from "@/lib/certificate-card";

const W = 1600;
const H = 1130; // A4 landscape ratio

/** Paints the card face onto a canvas: ivory paper, gold frame, the details. */
function paintFace(ctx: CanvasRenderingContext2D, d: CardDetails, logo?: HTMLImageElement) {
  ctx.fillStyle = "#FBF7EE";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#C99A2E";
  ctx.lineWidth = 18;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 80, W - 160, H - 160);
  if (logo) ctx.drawImage(logo, W / 2 - 90, 130, 180, 180);
  ctx.textAlign = "center";
  let y = logo ? 380 : 260;
  for (const line of cardLines(d)) {
    const style = {
      school: { size: 44, weight: "600", color: "#5B21B6", gap: 90 },
      title: { size: 76, weight: "700", color: "#17112B", gap: 150 },
      name: { size: 96, weight: "700", color: "#3F1585", gap: 120 },
      meta: { size: 36, weight: "500", color: "#5E5873", gap: 60 },
    }[line.role];
    const family = line.role === "name" || line.role === "title" ? "'Playfair Display', Georgia, serif" : "Inter, system-ui, sans-serif";
    const size = fitFont((s) => {
      ctx.font = `${style.weight} ${s}px ${family}`;
      return ctx.measureText(line.text).width;
    }, W - 320, style.size);
    ctx.font = `${style.weight} ${size}px ${family}`;
    ctx.fillStyle = style.color;
    ctx.fillText(line.text, W / 2, y);
    y += style.gap;
  }
}

/** The back: deep purple with a gold seal. */
function paintBack(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, "#3F1585");
  g.addColorStop(1, "#17112B");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 230, 0, Math.PI * 2);
  ctx.fillStyle = "#E0A526";
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#F3C969";
  ctx.stroke();
  ctx.fillStyle = "#17112B";
  ctx.textAlign = "center";
  ctx.font = "700 64px 'Playfair Display', Georgia, serif";
  ctx.fillText("SLSOM", W / 2, H / 2 + 22);
}

const makeCanvas = () => {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
};

/**
 * A slowly turning 3D certificate card, in plain three.js (named imports, so
 * the bundle keeps only what this scene uses). It turns over from its seal to
 * its face, then sways and tilts toward the pointer. Decorative: the same
 * details are on the page as text, so it is hidden from assistive tech.
 * Renders only while on screen; holds still for reduced motion.
 */
const Certificate3D = ({ details, className }: { details: CardDetails; className?: string }) => {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 0, 4.2);
    scene.add(new AmbientLight(0xffffff, 1.7));
    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 4, 5);
    const fill = new DirectionalLight(0xe9d5ff, 0.4);
    fill.position.set(-4, -2, 2);
    scene.add(key, fill);

    const faceCanvas = makeCanvas();
    const backCanvas = makeCanvas();
    paintFace(faceCanvas.getContext("2d")!, details);
    paintBack(backCanvas.getContext("2d")!);
    const front = new CanvasTexture(faceCanvas);
    const back = new CanvasTexture(backCanvas);
    front.colorSpace = back.colorSpace = SRGBColorSpace;
    front.anisotropy = back.anisotropy = 4;

    const edge = new MeshStandardMaterial({ color: 0xe0a526, metalness: 0.6, roughness: 0.35 });
    // A little self-light so the ivory paper reads as ivory, not grey.
    const faceMat = new MeshStandardMaterial({ map: front, roughness: 0.6, emissive: 0xffffff, emissiveMap: front, emissiveIntensity: 0.25 });
    const backMat = new MeshStandardMaterial({ map: back, roughness: 0.45, metalness: 0.1 });
    const geometry = new BoxGeometry(3.2, 3.2 * (H / W), 0.04);
    const card = new Mesh(geometry, [edge, edge, edge, edge, faceMat, backMat]);
    scene.add(card);

    // Repaint once the logo and the serif font are ready.
    let alive = true;
    const logo = new Image();
    logo.src = "/images/school-logo.png";
    Promise.all([logo.decode().catch(() => undefined), document.fonts?.ready]).then(() => {
      if (!alive) return;
      paintFace(faceCanvas.getContext("2d")!, details, logo.naturalWidth ? logo : undefined);
      front.needsUpdate = true;
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(el);

    let frame = 0;
    const t0 = performance.now();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!visible) return;
      if (reduced) {
        card.rotation.set(0.05, -0.25, 0);
      } else {
        const t = (performance.now() - t0) / 1000;
        const eased = 1 - Math.pow(1 - Math.min(1, t / 1.6), 3);
        card.rotation.y = Math.PI * (1 - eased) + Math.sin(t * 0.6) * 0.18 * eased + pointer.x * 0.15;
        card.rotation.x = Math.sin(t * 0.8) * 0.04 - pointer.y * 0.08;
        card.position.y = Math.sin(t * 1.1) * 0.04;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      geometry.dispose();
      [edge, faceMat, backMat].forEach((m) => m.dispose());
      front.dispose();
      back.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [details]);

  return <div ref={host} className={className ?? "h-64 w-full sm:h-80"} aria-hidden="true" />;
};

export default Certificate3D;
