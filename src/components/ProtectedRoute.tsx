import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, role, isLoading } = useAuth();
  const [timeoutReached, setTimeoutReached] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        localStorage.clear();
        toast.error("Authentication timeout. Please login again.");
        setTimeoutReached(true);
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (timeoutReached && isLoading) {
    return <Navigate to="/login" />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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

  // Admins/teachers can access student routes too — no redirect needed

  return <>{children}</>;
};
