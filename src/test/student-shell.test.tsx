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

import StudentLayout from "@/components/StudentLayout";

const auth = (over: Partial<AuthContextType> = {}): AuthContextType => ({
  user: { id: "u1" } as never,
  profile: { first_name: "Ada", last_name: "Lovelace" } as never,
  student: { admission_status: "ADMITTED" } as never,
  role: "student",
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
          <Route element={<StudentLayout />}>
            <Route path="/student/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/student/exams" element={<p>Exams page</p>} />
            <Route path="/student/exams/:id/lobby" element={<p>Lobby page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("student shell", () => {
  beforeEach(() => {
    authState.current = auth();
    localStorage.clear();
  });

  it("renders the routed page inside the shell", () => {
    renderAt("/student/dashboard");
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Student sections" })).toBeInTheDocument();
  });

  it("groups the sidebar under section headings", () => {
    renderAt("/student/dashboard");
    for (const section of ["Learning", "My Record", "Community", "Account"]) {
      expect(screen.getByRole("button", { name: new RegExp(section, "i") })).toBeInTheDocument();
    }
  });

  it("marks the current page for assistive tech", () => {
    renderAt("/student/dashboard");
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.map((el) => el.textContent)).toContain("Dashboard");
  });

  it("keeps Exams marked as current on a nested exam route", () => {
    renderAt("/student/exams/abc/lobby");
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.map((el) => el.textContent)).toContain("Exams");
  });

  it("collapses a section and remembers it", () => {
    renderAt("/student/dashboard");

    expect(screen.getAllByRole("link", { name: "Grades" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /my record/i }));
    expect(screen.queryByRole("link", { name: "Grades" })).not.toBeInTheDocument();
    expect(localStorage.getItem("slsm.nav.collapsed.student-record")).toBe("1");
  });

  it("opens the command palette on ctrl+K", () => {
    renderAt("/student/dashboard");
    expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument();
  });

  it("locks restricted items while admission is pending", () => {
    authState.current = auth({ student: { admission_status: "PENDING" } as never });
    renderAt("/student/dashboard");
    expect(screen.queryByRole("link", { name: "Grades" })).not.toBeInTheDocument();
    expect(screen.getByText(/application is under review/i)).toBeInTheDocument();
  });
});
