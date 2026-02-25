import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setLoading(true);
    setStatusMsg("Checking credentials...");
    try {
      console.log("[Login] Attempting sign in for:", email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      console.log("[Login] Sign in successful, fetching profile...");
      setStatusMsg("Loading profile...");

      // Fetch profile with retry
      let profile = null;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries && !profile) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileData) {
          profile = profileData;
          break;
        }

        console.log(`[Login] Profile not found, retry ${retries + 1}/${maxRetries}`);
        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Fallback to user_metadata if profile not found
      const userRole = profile?.role || data.user.user_metadata?.role || "student";
      console.log("[Login] Resolved role:", userRole);

      toast.success("Welcome back!");
      setStatusMsg("");

      if (userRole === "admin" || userRole === "teacher") {
        navigate("/admin/dashboard", { replace: true });
      } else {
        navigate("/student/dashboard");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[Login] Error:", errorMessage);
      toast.error(errorMessage || "Invalid login credentials");
      setStatusMsg("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 py-12 sm:py-16">
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
                <li>Disable browser extensions temporarily</li>
                <li>If the issue persists, contact the admin at{" "}
                  <a href="mailto:spiritlifeschoolofministry@gmail.com" 
                     className="underline hover:text-blue-900">
                    spiritlifeschoolofministry@gmail.com
                  </a>
                </li>
              </ul>
            </AlertDescription>
          </Alert>

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
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gradient-flame border-0 text-accent-foreground hover:opacity-90 h-11"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? statusMsg || "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
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
