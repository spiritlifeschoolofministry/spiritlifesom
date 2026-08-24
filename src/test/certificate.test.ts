import { describe, it, expect } from "vitest";
import { certificateFilename } from "@/lib/certificate-export";
import {
  CERTIFICATE_HEIGHT,
  CERTIFICATE_WIDTH,
  CERTIFICATE_FACES,
} from "@/lib/certificate-design";

describe("certificate design size", () => {
  // The whole point of the fixed size is that printing it at 1:1 with no page
  // margin fills an A4 landscape sheet. At 96dpi that is 297mm x 210mm.
  const MM_PER_PX = 25.4 / 96;

  it("is exactly one A4 landscape sheet at 96dpi", () => {
    expect(CERTIFICATE_WIDTH * MM_PER_PX).toBeCloseTo(297, 0);
    expect(CERTIFICATE_HEIGHT * MM_PER_PX).toBeCloseTo(210, 0);
  });

  it("keeps the A4 aspect ratio, so the PDF page is filled without distortion", () => {
    expect(CERTIFICATE_WIDTH / CERTIFICATE_HEIGHT).toBeCloseTo(Math.sqrt(2), 2);
  });
});

describe("CERTIFICATE_FACES", () => {
  it("names every family the artwork draws with", () => {
    const families = CERTIFICATE_FACES.join(" ");
    for (const family of ["Playfair Display", "Yellowtail", "Nunito"]) {
      expect(families).toContain(family);
    }
  });

  it("asks for the italic face the recipient's name is set in", () => {
    expect(CERTIFICATE_FACES.some((f) => f.startsWith("italic "))).toBe(true);
  });
});

describe("certificateFilename", () => {
  it("turns a name into a safe filename", () => {
    expect(certificateFilename("Olaopa Olajide Michael")).toBe(
      "SLSM_Certificate_Olaopa_Olajide_Michael",
    );
  });

  it("collapses runs of whitespace rather than leaving gaps", () => {
    expect(certificateFilename("  Ada   Nwosu ")).toBe("SLSM_Certificate_Ada_Nwosu");
  });

  it("drops characters that a filesystem would object to", () => {
    expect(certificateFilename("Ade/Bola:Test*")).toBe("SLSM_Certificate_AdeBolaTest");
  });

  it("still produces a filename when the name is empty", () => {
    expect(certificateFilename("   ")).toBe("SLSM_Certificate_Graduate");
  });
});
