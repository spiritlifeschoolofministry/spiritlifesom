import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { UserPlus, CalendarCheck } from "lucide-react";
import type { AuthContextType } from "@/contexts/AuthContext";

const authState = { current: {} as AuthContextType };
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => authState.current }));
vi.mock("@/routes/lazy-pages", () => ({ preloadPath: vi.fn(), preloadPortal: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-pending-admissions", () => ({ usePendingAdmissionsCount: () => 4 }));
vi.mock("@/components/NotificationsBell", () => ({ default: () => null }));

import AdminLayout from "@/components/AdminLayout";
import ActionCentre from "@/components/admin/ActionCentre";

const auth = (over: Partial<AuthContextType> = {}): AuthContextType => ({
  user: { id: "u1" } as never,
  profile: { first_name: "Ada", last_name: "Lovelace" } as never,
  student: null,
  role: "admin",
  isLoading: false,
  isNewUser: false,
  authError: null,
  isAuthReady: true,
  isProfileResolved: true,
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
  ...over,
});

const renderShell = () =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<p>Home page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("redesigned admin shell", () => {
  it("has a labelled sign out button and a search trigger", () => {
    authState.current = auth();
    renderShell();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /find a student, page or action/i })).toBeInTheDocument();
  });

  it("marks Home as the current page and shows the admissions count", () => {
    authState.current = auth();
    renderShell();
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.some((el) => el.textContent === "Home")).toBe(true);
    expect(screen.getAllByRole("link", { name: /admissions.*, 4 waiting/i }).length).toBeGreaterThan(0);
  });

  it("offers View as student only to staff with a student record", () => {
    authState.current = auth();
    const { unmount } = renderShell();
    expect(screen.queryByRole("link", { name: "View as student" })).not.toBeInTheDocument();
    unmount();
    authState.current = auth({ student: { id: "s1" } as never });
    renderShell();
    expect(screen.getByRole("link", { name: "View as student" })).toHaveAttribute("href", "/student/dashboard");
  });
});

describe("Needs you inbox", () => {
  it("lists only queues with work, each with an explicit action link", () => {
    render(
      <MemoryRouter>
        <ActionCentre
          queues={[
            { label: "New applications", noun: "application", count: 3, icon: UserPlus, path: "/admin/admissions", tone: "violet", cta: "Review" },
            { label: "Check-ins to verify", noun: "check-in", count: 0, icon: CalendarCheck, path: "/admin/attendance", tone: "amber", cta: "Verify" },
          ]}
        />
      </MemoryRouter>,
    );
    const review = screen.getByRole("link", { name: /review: new applications/i });
    expect(review).toHaveAttribute("href", "/admin/admissions");
    expect(review).toHaveTextContent("Review");
    expect(screen.queryByText("Check-ins to verify")).not.toBeInTheDocument();
    expect(screen.getByText("3 applications waiting")).toBeInTheDocument();
  });

  it("says when nothing is waiting", () => {
    render(
      <MemoryRouter>
        <ActionCentre queues={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Nothing waiting")).toBeInTheDocument();
  });
});
