import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PageSkeleton } from "@/components/portal/PageSkeleton";

const placeholders = (container: HTMLElement) =>
  container.querySelectorAll(".animate-pulse").length;

describe("PageSkeleton", () => {
  it("draws a title, a stat row and the panels the page asked for", () => {
    const { container } = render(<PageSkeleton stats={4} panels={2} />);
    // title + subtitle + 4 stats + 2 panels
    expect(placeholders(container)).toBe(8);
  });

  it("leaves the stat row out when the page has no stats", () => {
    const { container } = render(<PageSkeleton />);
    // title + subtitle + 1 panel
    expect(placeholders(container)).toBe(3);
  });

  it("says what a slow page is waiting on, in place of the subtitle", () => {
    const { container } = render(<PageSkeleton hint="Checking storage…" />);
    expect(screen.getAllByText("Checking storage…").length).toBeGreaterThan(0);
    // The subtitle bar makes way for the hint, so only the title and panel remain.
    expect(placeholders(container)).toBe(2);
  });

  it("tells a screen reader the page is still loading", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
