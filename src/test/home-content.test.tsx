import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

// Every piece of home page wording must come from Site content › home, so an
// admin can change it. Each key here returns "admin:<key>" (lists return two
// lines), and the test checks that text is what the page shows.

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

const LISTS = new Set(["physical_points", "online_points"]);
vi.mock("@/hooks/use-site-content", () => ({
  useSiteContent: () => ({
    get: (key: string) => (LISTS.has(key) ? `admin:${key}:1\nadmin:${key}:2` : key === "fees_note" ? "" : `admin:${key}`),
  }),
}));

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", NoopObserver);

/** The keys the home page reads; the migration gives each one a row. */
const HOME_KEYS = [
  "hero_welcome",
  "hero_headline",
  "hero_reference",
  "intake_button",
  "study_title",
  "journey_title",
  "step1_title",
  "step1_desc",
  "step2_title",
  "step2_desc",
  "step3_title",
  "step3_desc",
  "footer_text",
];

describe("home page wording", () => {
  it("shows what an admin wrote in Site content for every piece of text", async () => {
    const { default: Home } = await import("@/pages/Home");
    await act(async () => {
      render(
        <HelmetProvider>
          <MemoryRouter>
            <Home />
          </MemoryRouter>
        </HelmetProvider>,
      );
    });
    for (const key of HOME_KEYS) {
      expect(screen.getAllByText(`admin:${key}`, { exact: false }).length, key).toBeGreaterThan(0);
    }
    // Physical is shown first; both of its lines come from the admin's list.
    expect(screen.getByText("admin:physical_points:1")).toBeInTheDocument();
    expect(screen.getByText("admin:physical_points:2")).toBeInTheDocument();
    // The WhatsApp button carries the admin's message.
    const intake = screen.getAllByRole("link", { name: /admin:intake_button/ })[0];
    expect(intake.getAttribute("href")).toContain(encodeURIComponent("admin:intake_message"));
  });
});
