import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye, EyeOff, Info, Loader2, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import GoogleAuthButton from "@/components/GoogleAuthButton";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Magic link / OTP state
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [otpLoading, setOtpLoading] = useState(false);

  const routeByRole = async (userId: string, fallbackRole?: string) => {
    let profile = null;
    let retries = 0;
    while (retries < 3 && !profile) {
      const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (data) { profile = data; break; }
      retries++;
      if (retries < 3) await new Promise((r) => setTimeout(r, 1000));
    }
    const role = profile?.role || fallbackRole || "student";
    if (role === "admin" || role === "teacher") {
      navigate("/admin/dashboard", { replace: true });
    } else {
      navigate("/student/dashboard");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    setStatusMsg("Checking credentials...");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setStatusMsg("Loading profile...");
      toast.success("Welcome back!");
      setStatusMsg("");
      await routeByRole(data.user.id, data.user.user_metadata?.role);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(msg || "Invalid login credentials");
      setStatusMsg("");
    } finally {
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
    if (!otpCode || otpCode.length < 6) { toast.error("Enter the 6-digit code"); return; }
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
      await routeByRole(data.user.id, data.user.user_metadata?.role);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Invalid or expired code";
      toast.error(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 py-12 sm:py-16">
      <SEO title="Sign in | SLSOM" description="Sign in to your Spirit Life School of Ministry account." path="/login" />
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">Sign In</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back to Spirit Life SOM</p>
      </div>
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] border border-border p-8 sm:p-10">

          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800">
              <strong>Having trouble logging in?</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Try using <strong>Incognito/Private mode</strong> in your browser</li>
                <li>Or sign in with a one-time code sent to your email</li>
                <li>If the issue persists, contact{" "}
                  <a href="mailto:spiritlifeschoolofministry@gmail.com"
                     className="underline hover:text-blue-900 break-words">
                    spiritlifeschoolofministry@gmail.com
                  </a>
                </li>
              </ul>
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="password" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="password"><KeyRound className="h-4 w-4 mr-2" />Password</TabsTrigger>
              <TabsTrigger value="otp"><Mail className="h-4 w-4 mr-2" />Email Code</TabsTrigger>
            </TabsList>

            <TabsContent value="password">
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={loading} variant="flame" className="w-full h-11">
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {loading ? statusMsg || "Signing in..." : "Sign In"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-4">
                <Link to="/forgot-password" className="text-primary font-medium hover:underline">
                  Forgot your password?
                </Link>
              </p>
            </TabsContent>

            <TabsContent value="otp">
              {otpStep === "request" ? (
                <form onSubmit={handleRequestOtp} className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    We'll email you a 6-digit code to sign in — no password needed.
                  </p>
                  <div>
                    <Label htmlFor="otp-email">Email</Label>
                    <Input
                      id="otp-email"
                      type="email"
                      autoComplete="email"
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1"
                      required
                    />
                  </div>
                  <Button type="submit" disabled={otpLoading} variant="flame" className="w-full h-11">
                    {otpLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {otpLoading ? "Sending code..." : "Send me a code"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code we sent to <strong>{otpEmail}</strong>.
                  </p>
                  <div>
                    <Label htmlFor="otp-code">One-time code</Label>
                    <Input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="mt-1 tracking-widest text-center text-lg"
                      autoFocus
                      required
                    />
                  </div>
                  <Button type="submit" disabled={otpLoading} variant="flame" className="w-full h-11">
                    {otpLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {otpLoading ? "Verifying..." : "Verify & Sign In"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setOtpStep("request"); setOtpCode(""); }}
                    className="w-full text-sm text-primary hover:underline"
                  >
                    Use a different email
                  </button>
                </form>
              )}
            </TabsContent>
          </Tabs>

          <p className="text-center text-sm text-muted-foreground mt-4">
            New student?{" "}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
