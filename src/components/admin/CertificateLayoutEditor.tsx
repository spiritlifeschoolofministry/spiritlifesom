import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Konva from "konva";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CertificateBackdrop, DiplomaScroll } from "@/components/certificate/CertificateArtwork";
import {
  CERTIFICATE_HEIGHT,
  CERTIFICATE_WIDTH,
  CREAM,
  NAVY,
  loadCertificateFonts,
  type CertificateArtworkProps,
  type CertificateSignatory,
} from "@/lib/certificate-design";
import {
  CERTIFICATE_TEXT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  HEADER_GAP,
  LAYOUT_ELEMENTS,
  LAYOUT_ELEMENT_KEYS,
  LOGO_DISC,
  LOGO_IMAGE,
  NAME_CODE_GAP,
  RULE_DIAMOND,
  SIGNATURE_HEIGHT,
  SIGNATURE_OVERLAP,
  WIDTH_MIN,
  anchorFromBox,
  boxOrigin,
  defaultWidth,
  fromPixels,
  nudgePosition,
  resolveCertificateLayout,
  serialiseCertificateLayout,
  snapToCentre,
  toPixels,
  type CertificateLayout,
  type CertificateTextStyle,
  type FixedElementKey,
  type LayoutElementKey,
  type LayoutPosition,
} from "@/lib/certificate-layout";

/**
 * Drag-and-drop editor for where each element of a cohort's certificate sits.
 *
 * Loaded with React.lazy from CohortCertificateDialog, so konva only ever
 * downloads for a superadmin who opens it. The decorative sheet is the real
 * CertificateBackdrop drawn as HTML behind a transparent Konva stage; the
 * movable elements are Konva nodes set in the same type as the artwork. What is
 * saved is a CertificateLayout (fractions of the sheet), which CertificateArtwork
 * then uses for the student's certificate, its PDF/PNG export and the previews.
 */

export type CertificateLayoutEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cohortId: string;
  cohortName: string;
  /** Sample certificate: the cohort's real text and signatories, a sample name. */
  content: Omit<CertificateArtworkProps, "layout">;
  initialLayout: CertificateLayout | null;
  onSaved: (layout: CertificateLayout | null) => void;
};

type Size = { width: number; height: number };
type Point = { x: number; y: number };

type ElementModel = {
  key: LayoutElementKey;
  origin: Point;
  size: Size;
  /** Set when the element is drawn following its parent rather than at its own point. */
  attached: boolean;
  /** Font scale and width it carries if it is detached from its parent by moving it. */
  inherit: Pick<LayoutPosition, "fontScale" | "width">;
  children: ReactNode;
};

/** Screen pixels within which a dragged element snaps to a centre line. */
const SNAP_SCREEN_PX = 8;

const konvaFont = (style: CertificateTextStyle, scale: number) => {
  const fontSize = style.fontSize * scale;
  return {
    fontFamily: style.fontFamily,
    fontSize,
    fontStyle: `${style.italic ? "italic " : ""}${style.fontWeight}`,
    lineHeight: style.lineHeight,
    letterSpacing: (style.letterSpacingEm ?? 0) * fontSize,
    fill: style.color,
  };
};

const caseOf = (style: CertificateTextStyle, text: string) => (style.uppercase ? text.toUpperCase() : text);

/**
 * Measures text the way Konva will draw it, by laying out a throwaway node.
 * baseline is the first line's alphabetic baseline from the top of the box.
 */
const measure = (text: string, style: CertificateTextStyle, scale: number, width?: number) => {
  const node = new Konva.Text({
    text: caseOf(style, text),
    ...konvaFont(style, scale),
    width,
    wrap: width ? "word" : "none",
  });
  const metrics = node.measureSize(caseOf(style, text) || "M");
  const lineHeightPx = style.lineHeight * style.fontSize * scale;
  const result = {
    width: width ?? node.width(),
    height: node.height(),
    baseline: lineHeightPx / 2 + (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2,
  };
  node.destroy();
  return result;
};

/** Loads an image for a Konva node; null until it has loaded (or if it fails). */
const useHtmlImage = (src: string | null | undefined) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!src) return;
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);
  return image;
};

const hasSignatory = (s?: CertificateSignatory) =>
  Boolean(s?.name?.trim() || s?.title?.trim() || s?.signatureUrl);

const percent = (fraction: number) => Math.round(fraction * 1000) / 10;

const CertificateLayoutEditor = ({
  open,
  onOpenChange,
  cohortId,
  cohortName,
  content,
  initialLayout,
  onSaved,
}: CertificateLayoutEditorProps) => {
  const [layout, setLayout] = useState<CertificateLayout>(initialLayout ?? {});
  const [selected, setSelected] = useState<LayoutElementKey | null>(null);
  const [guides, setGuides] = useState({ vertical: false, horizontal: false });
  const [fontsVersion, setFontsVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [stageScale, setStageScale] = useState(0);
  // A callback ref (state), not useRef: the dialog content mounts after `open`
  // flips, so an effect keyed on `open` alone would find no box and never size
  // the stage.
  const [box, setBox] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setLayout(initialLayout ?? {});
    setSelected(null);
    let cancelled = false;
    // Measurements and the canvas both need the real faces, not fallbacks.
    void loadCertificateFonts().then(() => {
      if (!cancelled) setFontsVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [open, initialLayout]);

  // Scale the A4 stage to the space the dialog gives it, never past 1:1, and
  // short enough that the whole sheet is visible without scrolling.
  useEffect(() => {
    if (!open || !box) return;
    const fit = () =>
      setStageScale(
        Math.min(1, (box.clientWidth - 2) / CERTIFICATE_WIDTH, (window.innerHeight * 0.68) / CERTIFICATE_HEIGHT),
      );
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [open, box]);

  const logo = useHtmlImage("/certificate-logo.png");
  const [left, right] = content.signatories;
  const leftSignature = useHtmlImage(left?.signatureUrl);
  const rightSignature = useHtmlImage(right?.signatureUrl);

  const at = useMemo(() => resolveCertificateLayout(layout), [layout]);

  const models = useMemo(() => {
    // fontsVersion is read so measurements redo once the faces arrive.
    void fontsVersion;
    const T = CERTIFICATE_TEXT;
    const out = new Map<LayoutElementKey, ElementModel>();
    const scaleOf = (key: LayoutElementKey) => at[key]?.fontScale ?? 1;
    const place = (key: LayoutElementKey, position: LayoutPosition, size: Size) =>
      boxOrigin(key, toPixels(position), size);
    const add = (model: Omit<ElementModel, "attached" | "inherit"> & Partial<ElementModel>) =>
      out.set(model.key, { attached: false, inherit: {}, ...model });

    const textModel = (key: FixedElementKey, text: string, style: CertificateTextStyle) => {
      const s = scaleOf(key);
      const m = measure(text, style, s);
      add({
        key,
        origin: place(key, at[key], m),
        size: m,
        children: <Text text={caseOf(style, text)} {...konvaFont(style, s)} width={m.width} align="center" wrap="none" />,
      });
    };

    // Logo and school name
    {
      const s = scaleOf("header");
      const disc = LOGO_DISC * s;
      const image = LOGO_IMAGE * s;
      const text = measure("School of\nMinistry", T.header, s);
      const size = { width: disc + HEADER_GAP * s + text.width, height: Math.max(disc, text.height) };
      const fit = logo ? Math.min(image / logo.width, image / logo.height) : 1;
      add({
        key: "header",
        origin: place("header", at.header, size),
        size,
        children: (
          <>
            <Circle
              x={disc / 2}
              y={size.height / 2}
              radius={disc / 2}
              fill="#ffffff"
              shadowColor="black"
              shadowOpacity={0.08}
              shadowBlur={5}
              shadowOffsetY={1}
            />
            {logo && (
              <KonvaImage
                image={logo}
                x={disc / 2 - (logo.width * fit) / 2}
                y={size.height / 2 - (logo.height * fit) / 2}
                width={logo.width * fit}
                height={logo.height * fit}
              />
            )}
            <Text
              text={caseOf(T.header, "School of\nMinistry")}
              {...konvaFont(T.header, s)}
              x={disc + HEADER_GAP * s}
              y={(size.height - text.height) / 2}
            />
          </>
        ),
      });
    }

    textModel("title", "Certificate of Completion", T.title);
    textModel("certify", "This is to proudly certify that", T.certify);

    // Name, with the student code inline after it until the code is placed.
    {
      const s = scaleOf("recipientName");
      const boxWidth = (at.recipientName.width ?? 1) * CERTIFICATE_WIDTH;
      const code = content.studentCode ? content.studentCode : null;
      const codeAttached = Boolean(code) && !at.studentCode;
      const codeSize = codeAttached && code ? measure(code, T.studentCode, s) : null;
      const reserved = codeSize ? NAME_CODE_GAP * s + codeSize.width : 0;
      let name = measure(content.recipientName, T.recipientName, s);
      if (name.width > boxWidth - reserved) {
        name = measure(content.recipientName, T.recipientName, s, Math.max(40, boxWidth - reserved));
      }
      const rowLeft = (boxWidth - (name.width + reserved)) / 2;
      const size = { width: boxWidth, height: name.height };
      const origin = place("recipientName", at.recipientName, size);
      add({
        key: "recipientName",
        origin,
        size,
        children: (
          <Text
            text={content.recipientName}
            {...konvaFont(T.recipientName, s)}
            x={rowLeft}
            width={name.width}
            align="center"
            wrap="word"
          />
        ),
      });

      if (code) {
        const cs = codeAttached ? s : scaleOf("studentCode");
        const m = codeSize ?? measure(code, T.studentCode, cs);
        add({
          key: "studentCode",
          attached: codeAttached,
          inherit: { fontScale: s },
          origin: at.studentCode
            ? place("studentCode", at.studentCode, m)
            : { x: origin.x + rowLeft + name.width + NAME_CODE_GAP * s, y: origin.y + name.baseline - m.baseline },
          size: m,
          children: <Text text={code} {...konvaFont(T.studentCode, cs)} width={m.width} wrap="none" />,
        });
      }
    }

    // Diamond-tipped rule
    {
      const s = scaleOf("rule");
      const d = RULE_DIAMOND * s;
      const size = { width: (at.rule.width ?? 0.5) * CERTIFICATE_WIDTH, height: d };
      const diamond = (x: number) => (
        <Rect x={x} y={d / 2} width={d} height={d} offsetX={d / 2} offsetY={d / 2} rotation={45} fill={NAVY} />
      );
      add({
        key: "rule",
        origin: place("rule", at.rule, size),
        size,
        children: (
          <>
            {diamond(d / 2)}
            <Rect x={d} y={(d - 2 * s) / 2} width={Math.max(0, size.width - 2 * d)} height={2 * s} fill={NAVY} />
            {diamond(size.width - d / 2)}
          </>
        ),
      });
    }

    // Body text, with the second line under it until the second line is placed.
    {
      const s = scaleOf("mainText");
      const width = (at.mainText.width ?? 0.5) * CERTIFICATE_WIDTH;
      const main = measure(content.mainText, T.mainText, s, width);
      const origin = place("mainText", at.mainText, main);
      add({
        key: "mainText",
        origin,
        size: main,
        children: <Text text={content.mainText} {...konvaFont(T.mainText, s)} width={width} align="center" />,
      });

      if (content.subText) {
        const subAttached = !at.subText;
        const ss = subAttached ? s : scaleOf("subText");
        const subWidth = subAttached ? width : (at.subText?.width ?? defaultWidth("subText") ?? 0.5) * CERTIFICATE_WIDTH;
        const sub = measure(content.subText, T.mainText, ss, subWidth);
        add({
          key: "subText",
          attached: subAttached,
          inherit: { fontScale: s, width: width / CERTIFICATE_WIDTH },
          origin: at.subText ? place("subText", at.subText, sub) : { x: origin.x, y: origin.y + main.height },
          size: sub,
          children: <Text text={content.subText} {...konvaFont(T.mainText, ss)} width={subWidth} align="center" />,
        });
      }
    }

    textModel("date", `DATE: ${content.dateText}`, T.date);
    if (content.serial) {
      textModel(
        "serial",
        `${content.verifyHost ? `Verify at ${content.verifyHost} — ` : "Certificate No. "}${content.serial}`,
        T.serial,
      );
    }

    // Signature blocks: the drawn signature over the name, over the title.
    const signatoryModel = (key: "signatory1" | "signatory2", signatory: CertificateSignatory | undefined, signature: HTMLImageElement | null) => {
      if (!hasSignatory(signatory)) return;
      const s = scaleOf(key);
      const name = signatory?.name?.trim() ?? "";
      const title = signatory?.title?.trim() ?? "";
      const nameM = name ? measure(name, T.signatoryName, s) : null;
      const titleM = title ? measure(title, T.signatoryTitle, s) : null;
      const sigH = SIGNATURE_HEIGHT * s;
      const sigW = signature ? (signature.width / signature.height) * sigH : 0;
      const showSignature = Boolean(signatory?.signatureUrl);
      const width = Math.max(sigW, nameM?.width ?? 0, titleM?.width ?? 0, 1);
      const top = showSignature ? sigH - SIGNATURE_OVERLAP * s : 0;
      const size = { width, height: top + (nameM?.height ?? 0) + (titleM?.height ?? 0) };
      add({
        key,
        origin: place(key, at[key], size),
        size,
        children: (
          <>
            {signature && showSignature && (
              <KonvaImage image={signature} x={(width - sigW) / 2} y={0} width={sigW} height={sigH} />
            )}
            {nameM && (
              <Text
                text={caseOf(T.signatoryName, name)}
                {...konvaFont(T.signatoryName, s)}
                x={(width - nameM.width) / 2}
                y={top}
                wrap="none"
              />
            )}
            {titleM && (
              <Text
                text={caseOf(T.signatoryTitle, title)}
                {...konvaFont(T.signatoryTitle, s)}
                x={(width - titleM.width) / 2}
                y={top + (nameM?.height ?? 0)}
                wrap="none"
              />
            )}
          </>
        ),
      });
    };
    signatoryModel("signatory1", left, leftSignature);
    signatoryModel("signatory2", right, rightSignature);

    return out;
  }, [at, content, fontsVersion, left, right, leftSignature, rightSignature, logo]);

  // Listed in the sheet's reading order rather than the order they were measured in.
  const visibleKeys = LAYOUT_ELEMENT_KEYS.filter((key) => models.has(key));

  /** An element's position as stored, or -- if it follows its parent -- where it is drawn now. */
  const positionOf = useCallback(
    (key: LayoutElementKey): LayoutPosition | null => {
      const stored = at[key];
      if (stored) return stored;
      const model = models.get(key);
      if (!model) return null;
      const anchor = anchorFromBox(key, model.origin, model.size);
      return { ...fromPixels(anchor.x, anchor.y), ...model.inherit };
    },
    [at, models],
  );

  const setPosition = (key: LayoutElementKey, position: LayoutPosition) => {
    setLayout((current) => ({ ...current, [key]: position }));
    setStatus(`${LAYOUT_ELEMENTS[key].label}: ${percent(position.x)}% across, ${percent(position.y)}% down`);
  };

  const patchSelected = (patch: Partial<LayoutPosition>) => {
    if (!selected) return;
    const current = positionOf(selected);
    if (current) setPosition(selected, { ...current, ...patch });
  };

  const onDragMove = (key: LayoutElementKey, node: Konva.Node) => {
    const model = models.get(key);
    if (!model) return;
    const threshold = SNAP_SCREEN_PX / (stageScale || 1);
    const sx = snapToCentre(node.x(), model.size.width, CERTIFICATE_WIDTH, threshold);
    const sy = snapToCentre(node.y(), model.size.height, CERTIFICATE_HEIGHT, threshold);
    node.position({ x: sx.value, y: sy.value });
    if (sx.snapped !== guides.vertical || sy.snapped !== guides.horizontal) {
      setGuides({ vertical: sx.snapped, horizontal: sy.snapped });
    }
  };

  const onDragEnd = (key: LayoutElementKey, node: Konva.Node) => {
    const model = models.get(key);
    setGuides({ vertical: false, horizontal: false });
    if (!model) return;
    const anchor = anchorFromBox(key, { x: node.x(), y: node.y() }, model.size);
    const current = positionOf(key) ?? { x: 0, y: 0 };
    setPosition(key, { ...current, ...fromPixels(anchor.x, anchor.y) });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    const current = positionOf(selected);
    if (current) setPosition(selected, nudgePosition(current, move[0], move[1]));
  };

  const resetElement = (key: LayoutElementKey) => {
    setLayout((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setStatus(`${LAYOUT_ELEMENTS[key].label} back to its default place`);
  };

  const save = async () => {
    setSaving(true);
    const value = serialiseCertificateLayout(layout);
    // The row is normally seeded with the cohort; upsert covers one that is not.
    const { error } = await supabase
      .from("cohort_certificate_settings")
      .upsert({ cohort_id: cohortId, layout: value as Json }, { onConflict: "cohort_id" });
    setSaving(false);
    if (error) {
      console.error("Error saving certificate layout:", error);
      toast.error("Could not save the certificate layout");
      return;
    }
    toast.success(value ? `${cohortName} certificate layout saved` : `${cohortName} certificate back to the default layout`);
    onSaved(value);
    onOpenChange(false);
  };

  const selectedPosition = selected ? positionOf(selected) : null;
  const selectedModel = selected ? models.get(selected) : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[96vh] max-w-[min(96vw,1440px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Certificate layout for {cohortName}</DialogTitle>
          <DialogDescription>
            Drag the elements into place, or pick one from the list and use the arrow keys (Shift moves
            10px). Elements snap to the centre lines. Shown with a sample name; each graduate's own
            details are filled in.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div role="group" aria-label="Certificate elements" className="flex flex-wrap gap-1.5 lg:flex-col">
              {visibleKeys.map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={selected === key ? "default" : "outline"}
                  aria-pressed={selected === key}
                  className="justify-start"
                  onClick={() => setSelected(key)}
                >
                  {LAYOUT_ELEMENTS[key].label}
                  {models.get(key)?.attached && (
                    <span className="ml-1 text-[10px] font-normal opacity-70">
                      (follows {key === "studentCode" ? "name" : "main text"})
                    </span>
                  )}
                </Button>
              ))}
            </div>

            {selected && selectedPosition && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold">{LAYOUT_ELEMENTS[selected].label}</p>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    id="layout-x"
                    label="Across (%)"
                    value={percent(selectedPosition.x)}
                    min={0}
                    max={100}
                    step={0.1}
                    onChange={(v) => patchSelected({ x: v / 100 })}
                  />
                  <NumberField
                    id="layout-y"
                    label="Down (%)"
                    value={percent(selectedPosition.y)}
                    min={0}
                    max={100}
                    step={0.1}
                    onChange={(v) => patchSelected({ y: v / 100 })}
                  />
                  <NumberField
                    id="layout-scale"
                    label="Size (%)"
                    value={Math.round((selectedPosition.fontScale ?? 1) * 100)}
                    min={FONT_SCALE_MIN * 100}
                    max={FONT_SCALE_MAX * 100}
                    step={5}
                    onChange={(v) => patchSelected({ fontScale: v / 100 })}
                  />
                  {LAYOUT_ELEMENTS[selected].hasWidth && (
                    <NumberField
                      id="layout-width"
                      label="Width (%)"
                      value={percent(selectedPosition.width ?? defaultWidth(selected) ?? 0.5)}
                      min={WIDTH_MIN * 100}
                      max={100}
                      step={1}
                      onChange={(v) => patchSelected({ width: v / 100 })}
                    />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Position is the element's{" "}
                  {LAYOUT_ELEMENTS[selected].anchorY === "bottom" ? "bottom" : "top"}{" "}
                  {LAYOUT_ELEMENTS[selected].anchorX === "center" ? "centre" : LAYOUT_ELEMENTS[selected].anchorX}.
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => resetElement(selected)}>
                  Put this one back
                </Button>
              </div>
            )}

            <p aria-live="polite" className="sr-only">
              {status}
            </p>
          </div>

          {/* The outer box is measured; the sheet itself is centred inside it. */}
          <div ref={setBox} className="w-full min-w-0">
          <div
            tabIndex={0}
            role="group"
            aria-label="Certificate canvas. Select an element, then use the arrow keys to move it."
            onKeyDown={onKeyDown}
            className="relative mx-auto overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              width: stageScale ? CERTIFICATE_WIDTH * stageScale + 2 : "100%",
              height: stageScale ? CERTIFICATE_HEIGHT * stageScale + 2 : 320,
            }}
          >
            {stageScale > 0 && (
              <>
                {/* The real decorative sheet, drawn as HTML behind the transparent stage. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: CERTIFICATE_WIDTH,
                    height: CERTIFICATE_HEIGHT,
                    overflow: "hidden",
                    background: CREAM,
                    transform: `scale(${stageScale})`,
                    transformOrigin: "top left",
                    pointerEvents: "none",
                  }}
                >
                  <CertificateBackdrop />
                  <DiplomaScroll />
                </div>
                <Stage
                  width={CERTIFICATE_WIDTH * stageScale}
                  height={CERTIFICATE_HEIGHT * stageScale}
                  scaleX={stageScale}
                  scaleY={stageScale}
                  style={{ position: "absolute", top: 0, left: 0 }}
                  onMouseDown={(e) => e.target === e.target.getStage() && setSelected(null)}
                  onTouchStart={(e) => e.target === e.target.getStage() && setSelected(null)}
                >
                  <Layer key={fontsVersion}>
                    {[...models.values()].map((model) => {
                      const key = model.key;
                      return (
                        <Group
                          key={key}
                          x={model.origin.x}
                          y={model.origin.y}
                          draggable
                          onMouseDown={() => setSelected(key)}
                          onTouchStart={() => setSelected(key)}
                          onDragStart={() => setSelected(key)}
                          onDragMove={(e) => onDragMove(key, e.target)}
                          onDragEnd={(e) => onDragEnd(key, e.target)}
                          onMouseEnter={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) container.style.cursor = "move";
                          }}
                          onMouseLeave={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) container.style.cursor = "default";
                          }}
                        >
                          {/* Grab area and a faint outline, so every element shows it can move. */}
                          <Rect
                            width={model.size.width}
                            height={model.size.height}
                            fill="transparent"
                            stroke={selected === key ? "#2563eb" : "rgba(37, 99, 235, 0.28)"}
                            strokeWidth={(selected === key ? 2 : 1) / stageScale}
                            dash={selected === key ? undefined : [6 / stageScale, 4 / stageScale]}
                          />
                          {model.children}
                        </Group>
                      );
                    })}
                    {guides.vertical && (
                      <Line
                        points={[CERTIFICATE_WIDTH / 2, 0, CERTIFICATE_WIDTH / 2, CERTIFICATE_HEIGHT]}
                        stroke="#e11d48"
                        strokeWidth={1 / stageScale}
                        dash={[6 / stageScale, 4 / stageScale]}
                        listening={false}
                      />
                    )}
                    {guides.horizontal && (
                      <Line
                        points={[0, CERTIFICATE_HEIGHT / 2, CERTIFICATE_WIDTH, CERTIFICATE_HEIGHT / 2]}
                        stroke="#e11d48"
                        strokeWidth={1 / stageScale}
                        dash={[6 / stageScale, 4 / stageScale]}
                        listening={false}
                      />
                    )}
                  </Layer>
                </Stage>
              </>
            )}
            {selectedModel && (
              <span className="sr-only">
                Selected: {LAYOUT_ELEMENTS[selectedModel.key].label}
              </span>
            )}
          </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLayout({});
              setStatus("Every element back to its default place");
            }}
            disabled={saving}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" /> Reset to default
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save layout
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** A labelled number input that only reports finite, in-range values. */
const NumberField = ({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) => (
  <div className="space-y-1">
    <Label htmlFor={id} className="text-xs">
      {label}
    </Label>
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      className="h-8"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const next = Number.parseFloat(e.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
      }}
    />
  </div>
);

export default CertificateLayoutEditor;
