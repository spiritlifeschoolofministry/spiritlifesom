import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIGNATORIES,
  parseSignatories,
  serialiseSignatories,
  withEmptySlots,
} from "@/lib/certificate-signatories";
import { normaliseSerial, SERIAL_PATTERN } from "@/lib/certificate-serial";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("parseSignatories", () => {
  it("reads a stored pair", () => {
    const parsed = parseSignatories([
      { name: "Ada Nwosu", title: "Dean", signature: PNG },
      { name: "Bola Ade", title: "Registrar", signature: null },
    ]);
    expect(parsed).toEqual([
      { name: "Ada Nwosu", title: "Dean", signatureUrl: PNG },
      { name: "Bola Ade", title: "Registrar", signatureUrl: null },
    ]);
  });

  it("falls back to what was printed before this was configurable", () => {
    expect(parseSignatories(null)).toEqual(DEFAULT_SIGNATORIES);
    expect(parseSignatories("not an array")).toEqual(DEFAULT_SIGNATORIES);
  });

  it("treats a row of blanks as a mis-save rather than a choice", () => {
    expect(parseSignatories([{ name: "", title: "", signature: null }])).toEqual(DEFAULT_SIGNATORIES);
  });

  it("keeps a deliberate single signatory", () => {
    const parsed = parseSignatories([{ name: "Ada Nwosu", title: "Dean", signature: null }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Ada Nwosu");
  });

  it("never prints more than the two columns that exist", () => {
    const parsed = parseSignatories([
      { name: "A", title: "1", signature: null },
      { name: "B", title: "2", signature: null },
      { name: "C", title: "3", signature: null },
    ]);
    expect(parsed).toHaveLength(2);
  });

  it("rejects a remote signature URL", () => {
    // A remote image has to survive being inlined by the exporter, and silently
    // does not when it cannot -- so only data URLs are ever drawn.
    const parsed = parseSignatories([
      { name: "Ada", title: "Dean", signature: "https://example.com/sig.png" },
    ]);
    expect(parsed[0].signatureUrl).toBeNull();
  });

  it("survives junk in place of a field", () => {
    const parsed = parseSignatories([{ name: 42, title: undefined, signature: {} }]);
    expect(parsed).toEqual(DEFAULT_SIGNATORIES);
  });
});

describe("serialiseSignatories", () => {
  it("trims and normalises an empty signature to null", () => {
    expect(serialiseSignatories([{ name: "  Ada  ", title: " Dean ", signatureUrl: "" }])).toEqual([
      { name: "Ada", title: "Dean", signature: null },
    ]);
  });

  it("round-trips through parseSignatories", () => {
    const original = [{ name: "Ada Nwosu", title: "Dean", signatureUrl: PNG }];
    expect(parseSignatories(serialiseSignatories(original))).toEqual(original);
  });
});

describe("withEmptySlots", () => {
  it("pads out to the two columns the editor shows", () => {
    expect(withEmptySlots([{ name: "Ada", title: "Dean", signatureUrl: null }])).toHaveLength(2);
  });
});

describe("normaliseSerial", () => {
  it("accepts a serial exactly as printed", () => {
    expect(normaliseSerial("SLSM-4K7P-92XT")).toBe("SLSM-4K7P-92XT");
    expect(SERIAL_PATTERN.test(normaliseSerial("SLSM-4K7P-92XT"))).toBe(true);
  });

  it("copes with lowercase, spaces and a missing prefix", () => {
    expect(normaliseSerial("  slsm 4k7p 92xt ")).toBe("SLSM-4K7P-92XT");
    expect(normaliseSerial("4K7P92XT")).toBe("SLSM-4K7P-92XT");
  });

  it("maps the characters the alphabet leaves out to what they were read as", () => {
    // I and L are 1, O is 0, U is V -- which is why they are excluded.
    expect(normaliseSerial("SLSM-IL7P-9OXU")).toBe("SLSM-117P-90XV");
  });

  it("leaves something unrecognisable alone rather than inventing a serial", () => {
    expect(normaliseSerial("hello")).toBe("HELLO");
  });
});
