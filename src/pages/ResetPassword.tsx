import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

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
      <div className="flex flex-col items-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-[var(--shadow-card)] border border-border p-8 sm:p-10 text-center">
          <h1 className="text-xl font-bold text-foreground mb-2">Invalid Reset Link</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This link is invalid or has expired. Please request a new password reset.
          </p>
          <Button onClick={() => navigate("/forgot-password")} variant="outline">
            Request New Link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
          Set New Password
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter your new password below
        </p>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] border border-border p-8 sm:p-10">
          {success ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Password Updated</h2>
              <p className="text-sm text-muted-foreground">Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10 mt-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                variant="flame"
                className="w-full h-11"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
