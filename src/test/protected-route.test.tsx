import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AuthContextType } from "@/contexts/AuthContext";

const authState = { current: {} as AuthContextType };
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => authState.current }));

import { ProtectedRoute } from "@/components/ProtectedRoute";

const baseAuth = (over: Partial<AuthContextType>): AuthContextType => ({
  user: { id: "u1" } as never,
  profile: null,
  student: null,
  role: "student",
  isLoading: false,
  isNewUser: false,
  authError: null,
  isAuthReady: true,
  isProfileResolved: false,
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
  ...over,
});

const completeProfile = { first_name: "Ada", last_name: "L", phone: "+2348000000000" } as never;
const completeStudent = { gender: "Female", age: 24, learning_mode: "Online" } as never;

const renderAt = (path = "/student/dashboard") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/student/dashboard" element={<ProtectedRoute><p>Dashboard</p></ProtectedRoute>} />
        <Route path="/complete-profile" element={<p>Complete profile form</p>} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("ProtectedRoute profile gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits instead of redirecting while the profile read is still open", () => {
    // The regression this guards: a signed-in student whose rows had not come
    // back yet was briefly shown the "complete your profile" screen.
    authState.current = baseAuth({ isProfileResolved: false });
    renderAt();
    expect(screen.getByText(/loading your session/i)).toBeInTheDocument();
    expect(screen.queryByText(/complete profile form/i)).not.toBeInTheDocument();
  });

  it("renders the page as soon as resolved data says the profile is complete", () => {
    authState.current = baseAuth({
      isProfileResolved: true,
      profile: completeProfile,
      student: completeStudent,
    });
    renderAt();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("redirects only once a settled read shows fields are missing", () => {
    authState.current = baseAuth({ isProfileResolved: true, profile: completeProfile, student: null });
    renderAt();
    expect(screen.getByText(/complete profile form/i)).toBeInTheDocument();
  });

  it("shows the error screen rather than the profile form when the read failed", () => {
    authState.current = baseAuth({ isProfileResolved: false, authError: "Network down" });
    renderAt();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/complete profile form/i)).not.toBeInTheDocument();
  });
});
