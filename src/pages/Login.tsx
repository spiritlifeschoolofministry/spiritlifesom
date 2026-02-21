import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        navigate("/admin/dashboard");
      } else {
        navigate("/student/dashboard");
      }
    } catch (error: any) {
      console.error("[Login] Error:", error.message);
      toast.error(error.message || "Invalid login credentials");
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

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
              />
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
