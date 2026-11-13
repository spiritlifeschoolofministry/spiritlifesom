/**
 * Pure helpers for the 3D certificate card: whether WebGL is there at all,
 * and the lines painted on the card's face. Kept apart from the three.js
 * scene so they can be tested without a GPU.
 */

export interface CardDetails {
  name: string;
  cohort?: string | null;
  serial?: string | null;
  dateText?: string | null;
}

/** True when the browser can create a WebGL context. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The text on the card face, top to bottom. Empty parts are dropped. */
export function cardLines(d: CardDetails): { text: string; role: "school" | "title" | "name" | "meta" }[] {
  const meta = [d.cohort ? `${d.cohort} session` : null, d.dateText].filter(Boolean).join(" · ");
  return [
    { text: "Spirit Life School of Ministry", role: "school" as const },
    { text: "Certificate of Completion", role: "title" as const },
    { text: d.name.trim() || "Graduate", role: "name" as const },
    ...(meta ? [{ text: meta, role: "meta" as const }] : []),
    ...(d.serial ? [{ text: `No. ${d.serial}`, role: "meta" as const }] : []),
  ];
}

/** Shrinks a font size until the text fits the width (canvas measureText). */
export function fitFont(measure: (size: number) => number, maxWidth: number, start: number, min = 18): number {
  let size = start;
  while (size > min && measure(size) > maxWidth) size -= 2;
  return size;
}
