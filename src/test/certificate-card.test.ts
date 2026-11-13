import { describe, expect, it } from "vitest";
import { cardLines, fitFont } from "@/lib/certificate-card";

describe("cardLines", () => {
  it("lists school, title, name, then session/date and serial", () => {
    expect(cardLines({ name: "Ayomide Kadri", cohort: "2025/2026", dateText: "20 April 2026", serial: "SLSM-7K2Q-9MXD" })).toEqual([
      { text: "Spirit Life School of Ministry", role: "school" },
      { text: "Certificate of Completion", role: "title" },
      { text: "Ayomide Kadri", role: "name" },
      { text: "2025/2026 session · 20 April 2026", role: "meta" },
      { text: "No. SLSM-7K2Q-9MXD", role: "meta" },
    ]);
  });

  it("drops missing parts and never prints an empty name", () => {
    const lines = cardLines({ name: "  " });
    expect(lines.map((l) => l.role)).toEqual(["school", "title", "name"]);
    expect(lines[2].text).toBe("Graduate");
  });
});

describe("fitFont", () => {
  it("shrinks until the text fits, but not below the minimum", () => {
    const measure = (size: number) => size * 10;
    expect(fitFont(measure, 500, 80)).toBe(50);
    expect(fitFont(measure, 50, 80, 20)).toBe(20);
  });
});
