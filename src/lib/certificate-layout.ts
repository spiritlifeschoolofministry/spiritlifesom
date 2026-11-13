import {
  BODY,
  CERTIFICATE_HEIGHT,
  CERTIFICATE_WIDTH,
  NAVY,
  RED,
  SCRIPT,
  SERIF,
} from "@/lib/certificate-design";

/**
 * Where each part of a certificate sits, saved per cohort in
 * cohort_certificate_settings.layout and drawn by CertificateArtwork.
 *
 * Positions are fractions (0-1) of the certificate's width and height rather
 * than pixels, so a layout does not depend on the size the certificate happens
 * to be drawn at. Each element is placed by one anchor point -- which point of
 * the element that is (its top centre, its top-left corner, ...) is fixed per
 * element in LAYOUT_ELEMENTS, chosen so the defaults reproduce the original
 * certificate: a centred heading stays centred however long the text, and a
 * signatory block grows upwards when a signature is drawn over the name.
 *
 * A cohort with no saved layout (null) does not use any of this:
 * CertificateArtwork draws the original fixed markup.
 */

export const LAYOUT_ELEMENT_KEYS = [
  "header",
  "title",
  "certify",
  "recipientName",
  "studentCode",
  "rule",
  "mainText",
  "subText",
  "date",
  "serial",
  "signatory1",
  "signatory2",
] as const;

export type LayoutElementKey = (typeof LAYOUT_ELEMENT_KEYS)[number];

export type LayoutPosition = {
  /** Anchor x, as a fraction of the certificate's width. */
  x: number;
  /** Anchor y, as a fraction of the certificate's height. */
  y: number;
  /** Multiplier on the element's type size (and logo/signature size). 1 = as designed. */
  fontScale?: number;
  /** Width of a wrapping block (body text, rule), as a fraction of the certificate's width. */
  width?: number;
};

/** What is stored: only the elements that have been placed. */
export type CertificateLayout = Partial<Record<LayoutElementKey, LayoutPosition>>;

/**
 * Every element's position, defaults filled in. null means the element is
 * still attached to its parent the way the original certificate draws it --
 * the student code inline after the name, the second line of body text under
 * the first -- so it follows the parent however long a name or paragraph is.
 */
export type ResolvedLayout = Record<FixedElementKey, LayoutPosition> &
  Record<AttachedElementKey, LayoutPosition | null>;

/** The elements that, by default, follow another one rather than sit at a point. */
export type AttachedElementKey = "studentCode" | "subText";
export type FixedElementKey = Exclude<LayoutElementKey, AttachedElementKey>;

export type AnchorX = "left" | "center" | "right";
export type AnchorY = "top" | "bottom";

type ElementSpec = {
  label: string;
  anchorX: AnchorX;
  anchorY: AnchorY;
  /** Absent for an element that defaults to following its parent. */
  defaultPosition?: LayoutPosition;
  attachedTo?: LayoutElementKey;
  /** Whether the element is a wrapping block whose width can be set. */
  hasWidth?: boolean;
};

const fx = (px: number) => px / CERTIFICATE_WIDTH;
const fy = (px: number) => px / CERTIFICATE_HEIGHT;

/**
 * The defaults are the pixel figures of the original fixed artwork, converted
 * to fractions, so a layout of nothing but defaults prints the same certificate.
 */
export const LAYOUT_ELEMENTS: Record<LayoutElementKey, ElementSpec> = {
  header: { label: "Logo and school name", anchorX: "left", anchorY: "top", defaultPosition: { x: fx(239), y: fy(39) } },
  title: { label: "Certificate of Completion", anchorX: "center", anchorY: "top", defaultPosition: { x: 0.5, y: fy(276) } },
  certify: { label: "“This is to proudly certify that”", anchorX: "center", anchorY: "top", defaultPosition: { x: 0.5, y: fy(345) } },
  // A box rather than a point, like the original's row: a very long name wraps
  // inside it instead of running off the sheet.
  recipientName: {
    label: "Recipient name",
    anchorX: "center",
    anchorY: "top",
    hasWidth: true,
    defaultPosition: { x: 0.5, y: fy(421), width: fx(CERTIFICATE_WIDTH - 180) },
  },
  studentCode: { label: "Student code", anchorX: "center", anchorY: "top", attachedTo: "recipientName" },
  rule: {
    label: "Rule under the name",
    anchorX: "center",
    anchorY: "top",
    hasWidth: true,
    defaultPosition: { x: 0.5, y: fy(494), width: fx(CERTIFICATE_WIDTH - 460) },
  },
  mainText: {
    label: "Main text",
    anchorX: "center",
    anchorY: "top",
    hasWidth: true,
    defaultPosition: { x: 0.5, y: fy(507), width: fx(CERTIFICATE_WIDTH - 540) },
  },
  subText: { label: "Sub text", anchorX: "center", anchorY: "top", hasWidth: true, attachedTo: "mainText" },
  date: { label: "Date", anchorX: "center", anchorY: "top", defaultPosition: { x: 0.5, y: fy(597) } },
  serial: { label: "Serial / verify line", anchorX: "center", anchorY: "top", defaultPosition: { x: 0.5, y: fy(762) } },
  signatory1: { label: "Left signatory", anchorX: "left", anchorY: "bottom", defaultPosition: { x: fx(200), y: fy(CERTIFICATE_HEIGHT - 40) } },
  signatory2: { label: "Right signatory", anchorX: "right", anchorY: "bottom", defaultPosition: { x: fx(CERTIFICATE_WIDTH - 90), y: fy(CERTIFICATE_HEIGHT - 40) } },
};

export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 2;
export const WIDTH_MIN = 0.05;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isLayoutKey = (key: string): key is LayoutElementKey =>
  (LAYOUT_ELEMENT_KEYS as readonly string[]).includes(key);

/** One stored entry, or null if it is not usable. */
const parsePosition = (value: unknown): LayoutPosition | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (!isFiniteNumber(entry.x) || !isFiniteNumber(entry.y)) return null;

  const position: LayoutPosition = { x: clamp(entry.x, 0, 1), y: clamp(entry.y, 0, 1) };
  if (isFiniteNumber(entry.fontScale)) {
    position.fontScale = clamp(entry.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX);
  }
  if (isFiniteNumber(entry.width)) position.width = clamp(entry.width, WIDTH_MIN, 1);
  return position;
};

/**
 * Reads the layout jsonb. Unknown keys are ignored (a layout saved by a newer
 * build should still print here), unusable entries fall back to their default,
 * and anything that is not an object -- or has nothing usable in it -- is null,
 * which prints the original certificate.
 */
export const parseCertificateLayout = (value: unknown): CertificateLayout | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const layout: CertificateLayout = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isLayoutKey(key)) continue;
    const position = parsePosition(entry);
    if (position) layout[key] = position;
  }
  return Object.keys(layout).length ? layout : null;
};

/** Every element's effective position: stored, else default, else attached (null). */
export const resolveCertificateLayout = (layout: CertificateLayout | null | undefined): ResolvedLayout => {
  const resolved = {} as Record<LayoutElementKey, LayoutPosition | null>;
  for (const key of LAYOUT_ELEMENT_KEYS) {
    const spec = LAYOUT_ELEMENTS[key];
    const stored = layout?.[key];
    if (stored) {
      resolved[key] = {
        ...stored,
        width: spec.hasWidth ? stored.width ?? defaultWidth(key) : undefined,
      };
    } else {
      resolved[key] = spec.defaultPosition ? { ...spec.defaultPosition } : null;
    }
  }
  // Every fixed element has a defaultPosition, so only attached ones can be null.
  return resolved as ResolvedLayout;
};

/** The width a wrapping element gets when none is stored. */
export const defaultWidth = (key: LayoutElementKey): number | undefined => {
  const spec = LAYOUT_ELEMENTS[key];
  if (!spec.hasWidth) return undefined;
  if (spec.defaultPosition?.width) return spec.defaultPosition.width;
  return spec.attachedTo ? LAYOUT_ELEMENTS[spec.attachedTo].defaultPosition?.width : undefined;
};

const EPSILON = 1e-4;
const same = (a: number | undefined, b: number | undefined, fallback: number | undefined) =>
  Math.abs((a ?? fallback ?? 0) - (b ?? fallback ?? 0)) < EPSILON;

/** Whether a stored entry is the same as leaving the element where it defaults. */
const isDefaultPosition = (key: LayoutElementKey, position: LayoutPosition) => {
  const fallback = LAYOUT_ELEMENTS[key].defaultPosition;
  if (!fallback) return false; // An attached element that has been placed is never default.
  return (
    same(position.x, fallback.x, 0) &&
    same(position.y, fallback.y, 0) &&
    same(position.fontScale, 1, 1) &&
    same(position.width, fallback.width, fallback.width)
  );
};

const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * The value written back to the jsonb column: rounded, and without the entries
 * that only restate a default. A layout that changes nothing is null, so a
 * cohort reset to the default goes back to drawing the original markup.
 */
export const serialiseCertificateLayout = (
  layout: CertificateLayout | null | undefined,
): CertificateLayout | null => {
  if (!layout) return null;
  const out: CertificateLayout = {};
  for (const key of LAYOUT_ELEMENT_KEYS) {
    const position = layout[key];
    if (!position || isDefaultPosition(key, position)) continue;
    const entry: LayoutPosition = { x: round(clamp(position.x, 0, 1)), y: round(clamp(position.y, 0, 1)) };
    if (position.fontScale !== undefined && !same(position.fontScale, 1, 1)) {
      entry.fontScale = round(clamp(position.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX));
    }
    if (LAYOUT_ELEMENTS[key].hasWidth && position.width !== undefined && !same(position.width, defaultWidth(key), undefined)) {
      entry.width = round(clamp(position.width, WIDTH_MIN, 1));
    }
    out[key] = entry;
  }
  return Object.keys(out).length ? out : null;
};

/** True when a layout prints the same as having none. */
export const isDefaultLayout = (layout: CertificateLayout | null | undefined) =>
  serialiseCertificateLayout(layout) === null;

/** Anchor point in certificate pixels. */
export const toPixels = (position: Pick<LayoutPosition, "x" | "y">) => ({
  x: position.x * CERTIFICATE_WIDTH,
  y: position.y * CERTIFICATE_HEIGHT,
});

/** Certificate pixels back to a (clamped) fractional anchor. */
export const fromPixels = (x: number, y: number) => ({
  x: clamp(x / CERTIFICATE_WIDTH, 0, 1),
  y: clamp(y / CERTIFICATE_HEIGHT, 0, 1),
});

/**
 * Top-left corner of an element's box, given its anchor and size in pixels --
 * and the inverse, for turning a dragged box back into an anchor.
 */
export const boxOrigin = (key: LayoutElementKey, anchor: { x: number; y: number }, size: { width: number; height: number }) => {
  const { anchorX, anchorY } = LAYOUT_ELEMENTS[key];
  return {
    x: anchor.x - (anchorX === "center" ? size.width / 2 : anchorX === "right" ? size.width : 0),
    y: anchor.y - (anchorY === "bottom" ? size.height : 0),
  };
};

export const anchorFromBox = (key: LayoutElementKey, origin: { x: number; y: number }, size: { width: number; height: number }) => {
  const { anchorX, anchorY } = LAYOUT_ELEMENTS[key];
  return {
    x: origin.x + (anchorX === "center" ? size.width / 2 : anchorX === "right" ? size.width : 0),
    y: origin.y + (anchorY === "bottom" ? size.height : 0),
  };
};

/** Moves an element's anchor by a number of certificate pixels, staying on the sheet. */
export const nudgePosition = (position: LayoutPosition, dxPx: number, dyPx: number): LayoutPosition => ({
  ...position,
  x: clamp(position.x + dxPx / CERTIFICATE_WIDTH, 0, 1),
  y: clamp(position.y + dyPx / CERTIFICATE_HEIGHT, 0, 1),
});

/**
 * Snaps a box to the centre line of the sheet along one axis when its own
 * centre is within `threshold` pixels of it.
 */
export const snapToCentre = (start: number, size: number, total: number, threshold: number) => {
  const offset = total / 2 - (start + size / 2);
  return Math.abs(offset) <= threshold ? { value: start + offset, snapped: true } : { value: start, snapped: false };
};

/**
 * Type of each text element, shared by the artwork's layout mode and the
 * layout editor's canvas. lineHeight 1.333 / 1.364 stand in for "normal" in
 * Playfair Display / Nunito, which is what the original markup leaves it at.
 */
export type CertificateTextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic?: boolean;
  color: string;
  lineHeight: number;
  letterSpacingEm?: number;
  uppercase?: boolean;
};

export const CERTIFICATE_TEXT = {
  header: { fontFamily: SERIF, fontSize: 63, fontWeight: 900, color: NAVY, lineHeight: 0.92, letterSpacingEm: 0.01, uppercase: true },
  title: { fontFamily: SCRIPT, fontSize: 45, fontWeight: 400, color: RED, lineHeight: 1.2 },
  certify: { fontFamily: SERIF, fontSize: 19, fontWeight: 400, color: "#4a4a4a", lineHeight: 1.333 },
  recipientName: { fontFamily: SERIF, fontSize: 56, fontWeight: 700, italic: true, color: NAVY, lineHeight: 1.1 },
  studentCode: { fontFamily: SERIF, fontSize: 24, fontWeight: 700, italic: true, color: "#5f6470", lineHeight: 1.333 },
  mainText: { fontFamily: BODY, fontSize: 22, fontWeight: 400, color: "#4a4a4a", lineHeight: 1.55 },
  date: { fontFamily: SERIF, fontSize: 25, fontWeight: 700, color: NAVY, lineHeight: 1.333 },
  serial: { fontFamily: BODY, fontSize: 11, fontWeight: 400, color: "#8a8371", lineHeight: 1.364, letterSpacingEm: 0.03 },
  signatoryName: { fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: NAVY, lineHeight: 1.333, uppercase: true },
  signatoryTitle: { fontFamily: SERIF, fontSize: 19, fontWeight: 400, color: "#5f6672", lineHeight: 1.333, letterSpacingEm: 0.04, uppercase: true },
} satisfies Record<string, CertificateTextStyle>;

/** Gap between the name and an inline student code, and other fixed sizes, in pixels at scale 1. */
export const NAME_CODE_GAP = 24;
export const LOGO_DISC = 149;
export const LOGO_IMAGE = 140;
export const HEADER_GAP = 16;
export const SIGNATURE_HEIGHT = 54;
export const SIGNATURE_OVERLAP = 8;
export const RULE_DIAMOND = 9;
