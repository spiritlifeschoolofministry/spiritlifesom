import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  FileText,
  Folder,
  CreditCard,
  Bell,
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  FileText,
  Folder,
  CreditCard,
  Bell,
  Settings,
  UserCircle,
  LogOut,
  Menu,
  X,
  Eye,
  { label: "Assignments", icon: FileText, path: "/admin/assignments" },
  { label: "Materials", icon: Folder, path: "/admin/materials" },
  { label: "Fees", icon: CreditCard, path: "/admin/fees" },
  { label: "Announcements", icon: Bell, path: "/admin/announcements" },
  { label: "Settings", icon: Settings, path: "/admin/settings" },
  { label: "Profile", icon: UserCircle, path: "/admin/profile" },
];

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile: authProfile, signOut, student, role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (role && role !== "admin" && role !== "teacher") {
      toast.error("Unauthorized access");
      navigate("/student/dashboard");
    }
  }, [role, navigate]);

  const handleLogout = async () => {
    await signOut();
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  const initials = authProfile ? `${(authProfile.first_name || 'A')[0]}${(authProfile.last_name || 'U')[0]}` : "";

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
            {authProfile ? `${authProfile.first_name || 'Admin'} ${authProfile.last_name || 'User'}` : ""}
          </span>
          <Avatar className="h-8 w-8">
            {authProfile?.avatar_url && <AvatarImage src={authProfile.avatar_url} alt="Avatar" />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          {student && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/student/dashboard")}
              title="Switch to Student View"
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
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
