import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

vi.mock("@/routes/lazy-pages", () => ({ preloadPath: vi.fn() }));
vi.mock("@/hooks/use-site-content", () => ({
  useSiteContent: () => ({ get: (_k: string, fallback: string) => fallback }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signInWithOAuth: vi.fn() },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
vi.mock("@/contexts/useAuth", () => ({
  useAuth: () => ({
    user: null,
    role: null,
    profile: null,
    student: null,
    isProfileResolved: false,
    isAuthReady: true,
    authError: null,
  }),
}));

import PublicLayout from "@/components/PublicLayout";
import Login from "@/pages/Login";

const renderAt = (path: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<p>home</p>} />
            <Route path="/about" element={<p>about</p>} />
            <Route path="/verify/:serial" element={<p>verify</p>} />
            <Route path="/login" element={<Login />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("public header", () => {
  it("leaves the home page to draw its own top bar and footer", () => {
    renderAt("/");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("marks the current page and offers Log in and Apply now elsewhere", () => {
    renderAt("/about");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Apply now" })).toHaveAttribute("href", "/register");
    expect(within(nav).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("counts a verify link with a serial as the Verify page", () => {
    renderAt("/verify/SLSM-4K7P-92XT");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Verify" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the mobile menu from a labelled toggle", () => {
    renderAt("/about");
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(2);
  });
});

describe("login", () => {
  it("switches to the email code flow and back, carrying the typed email", () => {
    renderAt("/login");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");

    fireEvent.click(screen.getByRole("button", { name: "Email me a login code" }));
    expect(screen.getByRole("button", { name: "Send me a code" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");

    fireEvent.click(screen.getByRole("button", { name: /use my password instead/i }));
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });
});
