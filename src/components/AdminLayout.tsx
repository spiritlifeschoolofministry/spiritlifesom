import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { toast } from "sonner";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
  { label: "Students", icon: Users, path: "/admin/students" },
  { label: "Admissions", icon: UserCheck, path: "/admin/admissions" },
  { label: "Settings", icon: Settings, path: "/admin/settings" },
];

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ first_name: string; last_name: string; avatar_url: string | null } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, role")
        .eq("id", user.id)
        .single();

      if (data) {
        if (data.role !== "admin" && data.role !== "teacher") {
          toast.error("Unauthorized access");
          navigate("/student/dashboard");
          return;
        }
        setProfile(data);
      }
    };
    fetchProfile();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out");
    navigate("/login");
  };

  const initials = profile ? `${profile.first_name[0]}${profile.last_name[0]}` : "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button className="md:hidden text-foreground" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/admin/dashboard" className="text-primary font-bold text-lg tracking-tight hidden sm:block">
            SLSM Admin
          </Link>
        </div>
        <h1 className="text-sm font-semibold text-foreground tracking-wide">Admin Portal</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">
            {profile ? `${profile.first_name} ${profile.last_name}` : ""}
          </span>
          <Avatar className="h-8 w-8">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Avatar" />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden md:flex flex-col w-56 shrink-0 gradient-purple text-primary-foreground">
          <nav className="flex-1 py-4 space-y-1 px-2">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active ? "gradient-flame text-accent-foreground shadow-md" : "text-primary-foreground/80 hover:bg-primary-foreground/10"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <aside className="absolute left-0 top-14 bottom-0 w-60 gradient-purple text-primary-foreground" onClick={(e) => e.stopPropagation()}>
              <nav className="py-4 space-y-1 px-2">
                {NAV_ITEMS.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        active ? "gradient-flame text-accent-foreground shadow-md" : "text-primary-foreground/80 hover:bg-primary-foreground/10"
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
