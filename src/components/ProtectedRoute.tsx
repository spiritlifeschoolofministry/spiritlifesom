import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, AlertTriangle } from 'lucide-react';
import { isStudentProfileComplete } from '@/lib/profile-complete';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, profile, student, role, isLoading, isAuthReady, authError, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // A signed-in user whose profile hasn't resolved yet is still "loading", even
  // if isLoading has already flipped (e.g. a getSession error resolved while the
  // auth listener was mid-fetch). Deciding anything here would bounce them.
  const authPending = isLoading || (!!user && !isAuthReady);

  // Hold on a loading screen while auth data (user/profile/student) is being
  // resolved — this covers initial load, page refresh, AND the brief window
  // right after signing in. Without this, the profile-complete redirect below
  // could run with null profile/student data and briefly show /complete-profile
  // to users whose profiles are already complete. isLoading only toggles during
  // auth resolution, never on normal SPA navigation.
  if (authPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your session...</p>
      </div>
    );
  }

  // Auth error fallback — show error with retry option (don't clear localStorage).
  // Also covers a signed-in user whose profile never loaded: showing the error
  // is honest, where redirecting them to /complete-profile is not.
  if (authError && (!user || !profile)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">{authError}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="w-4 h-4 mr-2" /> Logout & Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  const normalizedRole = (role ?? "").toLowerCase();

  // Force students to finish their profile before entering any portal route.
  // Admins/teachers are exempt. By this point auth data is fully loaded, so a
  // null profile/student genuinely means an incomplete profile — not "still loading".
  if (normalizedRole === "student" || normalizedRole === "") {
    if (!isStudentProfileComplete(profile, student) && location.pathname !== "/complete-profile") {
      return <Navigate to="/complete-profile" replace />;
    }
  }

  if (requiredRole === "admin") {
    // Both admin and teacher can access general admin routes
    if (normalizedRole !== "admin" && normalizedRole !== "teacher") {
      return <Navigate to="/student/dashboard" />;
    }
  }

  if (requiredRole === "superadmin") {
    // Only strict admin can access these routes
    if (normalizedRole !== "admin") {
      return <Navigate to="/admin/dashboard" />;
    }
  }

  return <>{children}</>;
};
