import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, AlertTriangle } from 'lucide-react';
import { useRef, useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, role, isLoading, authError, signOut } = useAuth();
  const navigate = useNavigate();
  const didInitialLoad = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      didInitialLoad.current = true;
    }
  }, [isLoading]);

  // Only show loading spinner on first page load, not during navigation
  if (isLoading && !didInitialLoad.current) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your session...</p>
      </div>
    );
  }

  // Auth error fallback — show error with retry option (don't clear localStorage)
  if (authError && !user && didInitialLoad.current) {
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

  if (requiredRole === "admin") {
    if (role !== "admin" && role !== "teacher") {
      return <Navigate to="/student/dashboard" />;
    }
  }

  return <>{children}</>;
};
