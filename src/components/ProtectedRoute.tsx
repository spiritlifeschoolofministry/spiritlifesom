import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, role, isLoading, authError, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your session...</p>
      </div>
    );
  }

  // Auth error fallback — show error with logout option
  if (authError && !user) {
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
              localStorage.clear();
              window.location.href = '/login';
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
