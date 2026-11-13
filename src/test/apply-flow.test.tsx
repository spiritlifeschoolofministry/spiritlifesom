import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

// The Apply screens were redesigned (segmented progress, radio-card learning
// mode, a proper closed screen). These guard the parts people rely on: the
// closed state still offers a way to ask and a way in, and the steps still
// navigate and record the learning mode.

let accepting: unknown = true;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: table === "system_settings" ? { value: accepting } : null }),
        }),
        order: () =>
          Promise.resolve({
            data: [{ id: "c1", name: "2026 Intake", is_active: true, start_date: null, end_date: null }],
          }),
      }),
    }),
    auth: { signUp: vi.fn(), signInWithOAuth: vi.fn() },
  },
}));

import Register from "@/pages/Register";

const renderRegister = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("Apply flow (Register)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the closed screen with contact and log in links when applications are off", async () => {
    accepting = false;
    renderRegister();
    expect(await screen.findByRole("heading", { name: /applications are closed/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact the school/i })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });

  it("walks the steps with the segmented progress and records the learning mode", async () => {
    accepting = true;
    renderRegister();
    expect(await screen.findByText("Step 1 of 3 · Your account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up with google/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Step 2 of 3 · About you")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /go to step 3/i }));
    expect(screen.getByRole("heading", { name: "How will you study?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go to step 3/i })).toHaveAttribute("aria-current", "step");

    const online = screen.getByRole("radio", { name: /online/i });
    expect(online).not.toBeChecked();
    fireEvent.click(online);
    expect(online).toBeChecked();
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("slsom_register_draft") || "{}").learningMode).toBe("Online");

    expect(screen.getByRole("button", { name: /submit application/i })).toBeInTheDocument();
  });
});
