import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

// The hero is the landing page's largest-contentful paint, so this guards the
// thing that actually makes it cheap: one slide in the DOM, not all seven.

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null }) }),
      }),
    }),
  },
}));

vi.mock("@/hooks/use-site-content", () => ({
  useSiteContent: () => ({ get: (_k: string, fallback: string) => fallback }),
}));

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", NoopObserver);

const heroImgs = () =>
  Array.from(document.querySelectorAll("img")).filter((i) =>
    /\/images\/som\d/.test(i.getAttribute("src") ?? ""),
  );

const renderHome = async () => {
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
};

describe("Home hero", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("mounts only the first slide on initial render", async () => {
    await renderHome();
    const imgs = heroImgs();
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe("/images/som3.webp");
  });

  it("serves a smaller variant to narrow viewports and prioritises the LCP", async () => {
    await renderHome();
    const first = heroImgs()[0];
    expect(first.getAttribute("srcset")).toContain("/images/som3-800.webp 800w");
    expect(first.getAttribute("sizes")).toBe("100vw");
    expect(first.getAttribute("fetchpriority")).toBe("high");
    // Explicit dimensions keep the hero from shifting layout as it decodes.
    expect(first.getAttribute("width")).toBe("1439");
    expect(first.getAttribute("height")).toBe("957");
  });

  it("holds off on later slides until the first one has loaded", async () => {
    await renderHome();
    // Advancing the carousel must not pull in more images while the LCP image
    // is still in flight.
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(heroImgs()).toHaveLength(1);
  });

  it("preloads the next slide once the first has loaded", async () => {
    await renderHome();
    const first = heroImgs()[0];
    await act(async () => {
      first.dispatchEvent(new Event("load"));
    });
    const srcs = heroImgs().map((i) => i.getAttribute("src"));
    expect(srcs).toContain("/images/som3.webp");
    expect(srcs).toContain("/images/som4.webp");
    // Still nowhere near all seven.
    expect(srcs).toHaveLength(2);
  });
});
