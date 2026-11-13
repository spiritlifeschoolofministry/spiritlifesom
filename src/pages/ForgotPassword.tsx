import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { ApplyPanel, AuthCard, AuthPage, authInput, authLabel, authLink, authOutline, authPrimary } from "@/components/redesign/public/auth";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Password reset link sent!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPage title="Reset your password" subtitle="We'll send you a link to reset your password.">
      <SEO title="Reset Password | SLSOM" description="Request a password reset link for your Spirit Life School of Ministry account." path="/forgot-password" noindex />

      <AuthCard>
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Mail className="h-6 w-6 text-secondary-foreground" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We've sent a password reset link to <strong className="text-foreground break-anywhere">{email}</strong>.
              Please check your inbox and spam folder.
            </p>
            <button
              type="button"
              className={`${authOutline} mt-1 w-full`}
              onClick={() => { setSent(false); setEmail(""); }}
            >
              Send again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className={authLabel}>Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={authInput}
              />
            </div>

            <button type="submit" disabled={loading} className={authPrimary}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <Link to="/login" className={authLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to log in
        </Link>
      </AuthCard>

      <ApplyPanel />
    </AuthPage>
  );
};

export default ForgotPassword;
