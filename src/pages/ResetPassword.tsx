import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { AuthCard, AuthPage, authInput, authLabel, authOutline, authPrimary } from "@/components/redesign/public/auth";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Check if there's a recovery token in the URL hash
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success("Password updated successfully!");
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to update password";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery && !success) {
    return (
      <AuthPage title="Invalid reset link">
        <AuthCard className="items-center text-center">
          <p className="text-sm text-muted-foreground">
            This link is invalid or has expired. Please request a new password reset.
          </p>
          <button type="button" onClick={() => navigate("/forgot-password")} className={`${authOutline} w-full`}>
            Request new link
          </button>
        </AuthCard>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Set a new password" subtitle="Enter your new password below.">
      <SEO title="Set New Password | SLSOM" description="Create a new password for your Spirit Life School of Ministry account." path="/reset-password" noindex />

      <AuthCard>
        {success ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <CheckCircle className="h-6 w-6 text-secondary-foreground" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">Password updated</h2>
            <p className="text-sm text-muted-foreground">Redirecting to log in...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className={authLabel}>New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className={`${authInput} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword" className={authLabel}>Confirm password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className={authInput}
              />
            </div>

            <button type="submit" disabled={loading} className={authPrimary}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </AuthCard>
    </AuthPage>
  );
};

export default ResetPassword;
