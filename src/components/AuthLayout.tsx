import { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Decorative top bar */}
      <div className="h-1.5 w-full gradient-flame" />

      <div className="flex-1 flex flex-col items-center px-4 py-8 sm:py-12">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
            Spirit Life School of Ministry
          </h1>
          <p className="text-sm text-gradient-flame font-semibold mt-1 tracking-wide uppercase">
            Equipping The Saints...
          </p>
        </div>

        {children}
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Spirit Life School of Ministry. All rights reserved.
      </div>
    </div>
  );
};

export default AuthLayout;
