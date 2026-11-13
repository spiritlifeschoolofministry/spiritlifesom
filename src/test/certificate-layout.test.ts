import { describe, it, expect } from "vitest";
import { CERTIFICATE_HEIGHT, CERTIFICATE_WIDTH } from "@/lib/certificate-design";
import {
  LAYOUT_ELEMENTS,
  LAYOUT_ELEMENT_KEYS,
  anchorFromBox,
  boxOrigin,
  fromPixels,
  isDefaultLayout,
  nudgePosition,
  parseCertificateLayout,
  resolveCertificateLayout,
  serialiseCertificateLayout,
  snapToCentre,
  toPixels,
} from "@/lib/certificate-layout";

describe("default layout", () => {
  // The original artwork's pixel figures: a layout of defaults has to put
  // everything back where the fixed certificate draws it.
  it.each([
    ["header", 239, 39],
    ["title", CERTIFICATE_WIDTH / 2, 276],
    ["certify", CERTIFICATE_WIDTH / 2, 345],
    ["recipientName", CERTIFICATE_WIDTH / 2, 421],
    ["rule", CERTIFICATE_WIDTH / 2, 494],
    ["mainText", CERTIFICATE_WIDTH / 2, 507],
    ["date", CERTIFICATE_WIDTH / 2, 597],
    ["serial", CERTIFICATE_WIDTH / 2, 762],
    ["signatory1", 200, CERTIFICATE_HEIGHT - 40],
    ["signatory2", CERTIFICATE_WIDTH - 90, CERTIFICATE_HEIGHT - 40],
  ] as const)("places %s where the original artwork does", (key, x, y) => {
    const px = toPixels(resolveCertificateLayout(null)[key]);
    expect(px.x).toBeCloseTo(x, 6);
    expect(px.y).toBeCloseTo(y, 6);
  });

  it("keeps the student code and second line attached until they are placed", () => {
    const resolved = resolveCertificateLayout(null);
    expect(resolved.studentCode).toBeNull();
    expect(resolved.subText).toBeNull();
  });

  it("gives the wrapping blocks the original widths", () => {
    const resolved = resolveCertificateLayout(null);
    expect(resolved.mainText.width! * CERTIFICATE_WIDTH).toBeCloseTo(583, 6);
    expect(resolved.rule.width! * CERTIFICATE_WIDTH).toBeCloseTo(663, 6);
    expect(resolved.recipientName.width! * CERTIFICATE_WIDTH).toBeCloseTo(943, 6);
  });

  it("has a label and anchor for every element", () => {
    for (const key of LAYOUT_ELEMENT_KEYS) {
      expect(LAYOUT_ELEMENTS[key].label).toBeTruthy();
    }
  });
});

describe("parseCertificateLayout", () => {
  it("is null for anything that is not an object", () => {
    for (const value of [null, undefined, "x", 3, [], [{ x: 0.5, y: 0.5 }]]) {
      expect(parseCertificateLayout(value)).toBeNull();
    }
  });

  it("is null when nothing in it is usable", () => {
    expect(parseCertificateLayout({})).toBeNull();
    expect(parseCertificateLayout({ date: { x: "0.5", y: 0.2 }, nonsense: { x: 0, y: 0 } })).toBeNull();
  });

  it("ignores unknown keys and keeps the known ones", () => {
    expect(parseCertificateLayout({ date: { x: 0.4, y: 0.7 }, watermark: { x: 0.1, y: 0.1 } })).toEqual({
      date: { x: 0.4, y: 0.7 },
    });
  });

  it("clamps positions onto the sheet", () => {
    expect(parseCertificateLayout({ date: { x: -1, y: 4 } })).toEqual({ date: { x: 0, y: 1 } });
  });

  it("clamps the font scale and width, and drops them when not numbers", () => {
    expect(
      parseCertificateLayout({
        mainText: { x: 0.5, y: 0.6, fontScale: 9, width: 0 },
        date: { x: 0.5, y: 0.7, fontScale: "big", width: null },
      }),
    ).toEqual({
      mainText: { x: 0.5, y: 0.6, fontScale: 2, width: 0.05 },
      date: { x: 0.5, y: 0.7 },
    });
  });

  it("drops an entry with a non-finite coordinate, so it falls back to its default", () => {
    const layout = parseCertificateLayout({ date: { x: Number.NaN, y: 0.5 }, title: { x: 0.5, y: 0.3 } });
    expect(layout).toEqual({ title: { x: 0.5, y: 0.3 } });
    expect(resolveCertificateLayout(layout).date).toEqual(LAYOUT_ELEMENTS.date.defaultPosition);
  });
});

describe("resolveCertificateLayout", () => {
  it("fills in defaults around a stored element", () => {
    const resolved = resolveCertificateLayout({ date: { x: 0.2, y: 0.9 } });
    expect(resolved.date).toEqual({ x: 0.2, y: 0.9, width: undefined });
    expect(resolved.title).toEqual(LAYOUT_ELEMENTS.title.defaultPosition);
  });

  it("gives a placed second line the body text's width by default", () => {
    const resolved = resolveCertificateLayout({ subText: { x: 0.5, y: 0.75 } });
    expect(resolved.subText?.width).toBe(LAYOUT_ELEMENTS.mainText.defaultPosition!.width);
  });

  it("does not give a width to an element that does not wrap", () => {
    expect(resolveCertificateLayout({ date: { x: 0.5, y: 0.5, width: 0.3 } }).date.width).toBeUndefined();
  });
});

describe("serialiseCertificateLayout", () => {
  it("is null for a layout that only restates the defaults", () => {
    const defaults = Object.fromEntries(
      LAYOUT_ELEMENT_KEYS.filter((k) => LAYOUT_ELEMENTS[k].defaultPosition).map((k) => [
        k,
        { ...LAYOUT_ELEMENTS[k].defaultPosition!, fontScale: 1 },
      ]),
    );
    expect(serialiseCertificateLayout(defaults)).toBeNull();
    expect(isDefaultLayout(defaults)).toBe(true);
    expect(isDefaultLayout(null)).toBe(true);
  });

  it("keeps moved elements, rounded, and drops the untouched ones", () => {
    const out = serialiseCertificateLayout({
      date: { x: 0.123456789, y: 0.9 },
      title: { ...LAYOUT_ELEMENTS.title.defaultPosition! },
    });
    expect(out).toEqual({ date: { x: 0.1235, y: 0.9 } });
    expect(isDefaultLayout(out)).toBe(false);
  });

  it("keeps a placed attached element even at the top-left", () => {
    expect(serialiseCertificateLayout({ studentCode: { x: 0, y: 0 } })).toEqual({ studentCode: { x: 0, y: 0 } });
  });

  it("keeps a changed font scale or width at the default position", () => {
    const main = LAYOUT_ELEMENTS.mainText.defaultPosition!;
    expect(serialiseCertificateLayout({ mainText: { ...main, fontScale: 1.25 } })).toEqual({
      mainText: { x: 0.5, y: Math.round(main.y * 10000) / 10000, fontScale: 1.25 },
    });
    expect(serialiseCertificateLayout({ mainText: { ...main, width: 0.7 } })?.mainText?.width).toBe(0.7);
  });

  it("round-trips through parseCertificateLayout", () => {
    const out = serialiseCertificateLayout({ date: { x: 0.25, y: 0.5, fontScale: 1.5 } });
    expect(parseCertificateLayout(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });
});

describe("geometry helpers", () => {
  const size = { width: 200, height: 50 };

  it("converts an anchor to a box origin and back for every anchor kind", () => {
    for (const key of ["header", "title", "signatory1", "signatory2"] as const) {
      const anchor = { x: 400, y: 300 };
      expect(anchorFromBox(key, boxOrigin(key, anchor, size), size)).toEqual(anchor);
    }
  });

  it("puts a centred element's box half its width to the left of its anchor", () => {
    expect(boxOrigin("date", { x: 500, y: 100 }, size)).toEqual({ x: 400, y: 100 });
  });

  it("puts a bottom-right anchored signatory's box above and left of its anchor", () => {
    expect(boxOrigin("signatory2", { x: 1000, y: 700 }, size)).toEqual({ x: 800, y: 650 });
  });

  it("round-trips pixels and fractions, clamped to the sheet", () => {
    expect(toPixels(fromPixels(561.5, 397))).toEqual({ x: 561.5, y: 397 });
    expect(fromPixels(-10, 5000)).toEqual({ x: 0, y: 1 });
  });

  it("nudges by pixels and stops at the edge", () => {
    const moved = nudgePosition({ x: 0.5, y: 0.5, fontScale: 1.2 }, CERTIFICATE_WIDTH / 10, 0);
    expect(moved.x).toBeCloseTo(0.6, 9);
    expect(moved.fontScale).toBe(1.2);
    expect(nudgePosition({ x: 0, y: 0 }, -5, -5)).toEqual({ x: 0, y: 0 });
  });

  it("snaps to the centre line only within the threshold", () => {
    expect(snapToCentre(455, 200, 1123, 8)).toEqual({ value: 461.5, snapped: true });
    expect(snapToCentre(400, 200, 1123, 8)).toEqual({ value: 400, snapped: false });
  });
});
