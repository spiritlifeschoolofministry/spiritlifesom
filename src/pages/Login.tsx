import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, Eye, EyeOff, Info, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/useAuth";
import { isStudentProfileComplete } from "@/lib/profile-complete";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { SIGNUP_REFUSED_PARAM, SIGNUP_REFUSED_VALUE } from "@/lib/signup-closed";
import {
  ApplyPanel,
  AuthCard,
  AuthPage,
  authInput,
  authLabel,
  authLink,
  authOutline,
  authPrimary,
  authSoft,
} from "@/components/redesign/public/auth";

const Login = () => {
  const navigate = useNavigate();
  const { user, role, profile, student, isProfileResolved, isAuthReady, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  // Set when "Continue with Google" was used by an address with no account and
  // the database refused to create one. See lib/signup-closed.ts.
  const [signupRefusal, setSignupRefusal] = useState<"closed" | "failed" | null>(null);

  // Magic link / OTP state. "code" swaps the password form for the
  // one-time-code flow ("Email me a login code").
  const [mode, setMode] = useState<"password" | "code">("password");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [otpLoading, setOtpLoading] = useState(false);

  /**
   * Where this account belongs, decided from the auth context rather than from
   * a second role query of our own. Sending every student to the dashboard and
   * letting the route guard bounce the incomplete ones is what produced the
   * dashboard-then-/complete-profile jump right after signing in.
   */
  const destination = useMemo(() => {
    const r = (role || "").toLowerCase();
    if (r === "admin" || r === "teacher") return "/admin/dashboard";
    return isStudentProfileComplete(profile, student) ? "/student/dashboard" : "/complete-profile";
  }, [role, profile, student]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(SIGNUP_REFUSED_PARAM) !== SIGNUP_REFUSED_VALUE) return;
    window.history.replaceState(null, "", "/login");
    // The refusal reads the same whatever caused it, so only call it "closed"
    // when the setting says so.
    supabase.from("system_settings").select("value").eq("key", "accepting_applications").maybeSingle()
      .then(({ data }) => {
        const closed = data?.value === false || data?.value === "false";
        setSignupRefusal(closed ? "closed" : "failed");
      });
  }, []);

  // Redirect once — and only once — the context has a settled answer for this
  // user. `redirecting` keeps the form disabled in the meantime instead of
  // flicking back to an empty sign-in box.
  useEffect(() => {
    if (!user) return;
    if (!redirecting && !isProfileResolved) return;
    if (isProfileResolved) {
      navigate(destination, { replace: true });
      return;
    }
    // The profile read failed or timed out; the portal's own error screen is a
    // better place to land than a login form that looks like it did nothing.
    if (redirecting && isAuthReady && authError) {
      navigate("/student/dashboard", { replace: true });
    }
  }, [user, redirecting, isProfileResolved, isAuthReady, authError, destination, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    setStatusMsg("Checking credentials...");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
      // Stay in the loading state until the auth context resolves and the
      // effect above routes us — the session is only half-ready right now.
      setStatusMsg("Loading your portal...");
      setRedirecting(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(msg || "Invalid login credentials");
      setStatusMsg("");
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpEmail) { toast.error("Enter your email"); return; }
    setOtpLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: otpEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/student/dashboard`,
        },
      });
      if (error) throw error;
      toast.success("Code sent! Check your email for the 6-digit code.");
      setOtpStep("verify");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to send code";
      toast.error(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) { toast.error("Enter the code from your email"); return; }
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: otpCode,
        type: "email",
      });
      if (error) throw error;
      if (!data.user) throw new Error("Invalid code");
      toast.success("Signed in!");
      setRedirecting(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Invalid or expired code";
      toast.error(msg);
      setOtpLoading(false);
    }
  };

  const busy = loading || redirecting;

  const switchToCode = () => {
    // Carry over an address already typed in the password form.
    if (!otpEmail && email) setOtpEmail(email);
    setMode("code");
  };

  return (
    <AuthPage title="Welcome back" subtitle="Log in to your Spirit Life SOM portal.">
      <SEO title="Sign in | SLSOM" description="Sign in to your Spirit Life School of Ministry account." path="/login" />

      {signupRefusal && (
        <Alert variant="destructive" className="rounded-2xl bg-card">
          <AlertDescription className="text-sm">
            {signupRefusal === "closed" ? (
              <>
                <strong>That Google account isn't registered with us, and registrations are currently closed.</strong>{" "}
                If you are already a student, sign in with the email address you registered with.
              </>
            ) : (
              <>We couldn't create an account for that Google address. Please try again, or contact the school office.</>
            )}
          </AlertDescription>
        </Alert>
      )}

      <AuthCard>
        <GoogleAuthButton label="Sign in with Google" />
        <div className="flex items-center gap-2.5 text-[13px] font-semibold text-muted-foreground">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          or use your email
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>

        {mode === "password" ? (
          <>
            <form onSubmit={handleLogin} className="flex flex-col gap-3.5" aria-label="Log in with password">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className={authLabel}>Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={authInput}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className={authLabel}>Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`${authInput} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={busy} className={authPrimary}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? statusMsg || "Signing in..." : "Log in"}
              </button>
            </form>

            <div className="grid grid-cols-2 gap-2.5">
              <Link to="/forgot-password" className={authOutline}>
                Forgot password?
              </Link>
              <button type="button" onClick={switchToCode} className={authSoft}>
                Email me a login code
              </button>
            </div>
          </>
        ) : otpStep === "request" ? (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-3.5" aria-label="Request a login code">
            <p className="text-sm text-muted-foreground">
              We'll email you a 6-digit code to sign in — no password needed.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp-email" className={authLabel}>Email</Label>
              <Input
                id="otp-email"
                type="email"
                autoComplete="email"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                placeholder="you@example.com"
                className={authInput}
                required
              />
            </div>
            <button type="submit" disabled={otpLoading} className={authPrimary}>
              {otpLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {otpLoading ? "Sending code..." : "Send me a code"}
            </button>
            <button type="button" onClick={() => setMode("password")} className={authLink}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Use my password instead
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3.5" aria-label="Enter your login code">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code we sent to <strong className="text-foreground break-anywhere">{otpEmail}</strong>.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp-code" className={authLabel}>One-time code</Label>
              <Input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Enter the code from your email"
                className={`${authInput} text-center text-lg tracking-widest md:text-lg`}
                aria-describedby="otp-code-hint"
                autoFocus
                required
              />
              <p id="otp-code-hint" className="text-xs text-muted-foreground">
                The code is usually 6–8 digits long.
              </p>
            </div>
            <button type="submit" disabled={otpLoading || redirecting} className={authPrimary}>
              {(otpLoading || redirecting) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {otpLoading || redirecting ? "Verifying..." : "Verify & log in"}
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => { setOtpStep("request"); setOtpCode(""); }}
                className={authOutline}
              >
                Use a different email
              </button>
              <button type="button" onClick={() => setMode("password")} className={authSoft}>
                Use my password
              </button>
            </div>
          </form>
        )}

        <p className="sr-only" role="status" aria-live="polite">
          {busy ? statusMsg : ""}
        </p>
      </AuthCard>

      <details className="group rounded-2xl border border-border bg-card px-4 text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
          <span className="inline-flex items-center gap-2">
            <Info className="h-4 w-4 text-primary dark:text-foreground" aria-hidden="true" />
            Having trouble logging in?
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mb-4 mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Try using <strong className="text-foreground">Incognito/Private mode</strong> in your browser</li>
          <li>Or sign in with a one-time code sent to your email</li>
          <li>
            If the issue persists, contact{" "}
            <a
              href="mailto:spiritlifeschoolofministry@gmail.com"
              className="font-medium text-primary underline break-anywhere dark:text-foreground"
            >
              spiritlifeschoolofministry@gmail.com
            </a>
          </li>
        </ul>
      </details>

      <ApplyPanel />
    </AuthPage>
  );
};

export default Login;
