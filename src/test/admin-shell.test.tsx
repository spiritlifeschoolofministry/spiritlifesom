import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { AuthContextType } from "@/contexts/AuthContext";

const authState = { current: {} as AuthContextType };
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => authState.current }));
vi.mock("@/routes/lazy-pages", () => ({
  preloadPath: vi.fn(),
  preloadPortal: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-pending-admissions", () => ({
  usePendingAdmissionsCount: () => 3,
}));
vi.mock("@/components/NotificationsBell", () => ({ default: () => null }));

import AdminLayout from "@/components/AdminLayout";

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

const renderAt = (path: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/admin/students" element={<p>Students page</p>} />
            <Route path="/admin/students/:id" element={<p>Student detail page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("admin shell", () => {
  beforeEach(() => {
    authState.current = auth();
    localStorage.clear();
  });

  it("renders the routed page inside the shell", () => {
    renderAt("/admin/dashboard");
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });

  it("links the pages that used to be reachable only by URL", () => {
    renderAt("/admin/dashboard");
    for (const label of ["Payments", "Analytics", "Audit Log", "Email History"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("groups the sidebar under section headings", () => {
    renderAt("/admin/dashboard");
    for (const section of ["People", "Academics", "Finance", "Communication", "Insights", "System"]) {
      expect(screen.getByRole("button", { name: new RegExp(section, "i") })).toBeInTheDocument();
    }
  });

  it("keeps Students marked as current on a student detail route", () => {
    renderAt("/admin/students/abc-123");
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.map((el) => el.textContent)).toContain("Students");
  });

  it("hides the superadmin-only pages from a teacher", () => {
    authState.current = auth({ role: "teacher" });
    renderAt("/admin/dashboard");
    for (const label of ["Settings", "Storage", "Audit Log", "Email History"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    // Teachers still get the general admin pages.
    expect(screen.getAllByRole("link", { name: "Students" }).length).toBeGreaterThan(0);
  });

  it("collapses a section and remembers it", () => {
    renderAt("/admin/dashboard");
    expect(screen.getAllByRole("link", { name: "Fees" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /finance/i }));
    expect(screen.queryByRole("link", { name: "Fees" })).not.toBeInTheDocument();
    expect(localStorage.getItem("slsm.nav.collapsed.admin-finance")).toBe("1");
  });

  it("offers student search in the command palette", () => {
    renderAt("/admin/dashboard");
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText(/search pages or students/i)).toBeInTheDocument();
  });
});
