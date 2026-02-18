import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileText,
  Users,
  CreditCard,
  UserCircle,
  LogOut,
  Menu,
  X,
  Lock,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface StudentLayoutProps {
  children: React.ReactNode;
  admissionStatus?: string | null;
}

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/student/dashboard", restrictedWhenPending: false },
  { label: "My Courses", icon: BookOpen, path: "/student/courses", restrictedWhenPending: false },
  { label: "Attendance", icon: CalendarCheck, path: "/student/attendance", restrictedWhenPending: false },
  { label: "Assignments", icon: ClipboardList, path: "/student/assignments", restrictedWhenPending: true },
  { label: "Course Materials", icon: FileText, path: "/student/materials", restrictedWhenPending: true },
  { label: "Course Mates", icon: Users, path: "/student/coursemates", restrictedWhenPending: true },
  { label: "Fees", icon: CreditCard, path: "/student/fees", restrictedWhenPending: false },
  { label: "Profile", icon: UserCircle, path: "/student/profile", restrictedWhenPending: false },
];

const StudentLayout = ({ children, admissionStatus }: StudentLayoutProps) => {
  const isPending = admissionStatus === "Pending";
  const isRejected = admissionStatus === "Rejected";
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
        .select("first_name, last_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (data) setProfile(data);
    };
    fetchProfile();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out");
    navigate("/login");
  };

  const initials = profile ? `${profile.first_name[0]}${profile.last_name[0]}` : "";

  const renderNavItem = (item: typeof NAV_ITEMS[0], opts: { mobile?: boolean; closeSidebar?: boolean }) => {
    const active = location.pathname === item.path;
    const restricted = isPending && item.restrictedWhenPending;

    if (opts.mobile) {
      if (restricted) {
        return (
          <span key={item.path} className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground/40 cursor-not-allowed">
            <Lock className="w-5 h-5" />
            {item.label.split(" ")[0]}
          </span>
        );
      }
      return (
        <Link key={item.path} to={item.path} className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? "text-accent" : "text-muted-foreground"}`}>
          <item.icon className="w-5 h-5" />
          {item.label.split(" ")[0]}
        </Link>
      );
    }

    if (restricted) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary-foreground/40 cursor-not-allowed">
              <Lock className="w-4 h-4 shrink-0" />
              {item.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">Available after admission approval</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={opts.closeSidebar ? () => setSidebarOpen(false) : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          active ? "gradient-flame text-accent-foreground shadow-md" : "text-primary-foreground/80 hover:bg-primary-foreground/10"
        }`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Nav */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button className="md:hidden text-foreground" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/student/dashboard" className="text-primary font-bold text-lg tracking-tight hidden sm:block">
            SLSM
          </Link>
        </div>
        <h1 className="text-sm font-semibold text-foreground tracking-wide">Student Portal</h1>
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

      {/* Admission Status Banner */}
      {isPending && (
        <div className="bg-[hsl(48,96%,89%)] border-b border-[hsl(48,96%,60%)] text-[hsl(26,90%,20%)] px-4 py-3 flex items-center gap-3 shrink-0">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[hsl(26,90%,30%)]" />
          <p className="text-sm font-medium">
            Your application is under review. You will receive an admission confirmation email once approved. Some features are restricted until admission is finalized.
          </p>
        </div>
      )}
      {isRejected && (
        <div className="bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-3 flex items-center gap-3 shrink-0">
          <XCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">
            Your application was not approved for this session. Please contact the school office for more information.
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - desktop */}
        <TooltipProvider>
          <aside className="hidden md:flex flex-col w-56 shrink-0 gradient-purple text-primary-foreground">
            <nav className="flex-1 py-4 space-y-1 px-2">
              {NAV_ITEMS.map((item) => renderNavItem(item, {}))}
            </nav>
          </aside>
        </TooltipProvider>

        {/* Sidebar - mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <TooltipProvider>
              <aside className="absolute left-0 top-14 bottom-0 w-60 gradient-purple text-primary-foreground" onClick={(e) => e.stopPropagation()}>
                <nav className="py-4 space-y-1 px-2">
                  {NAV_ITEMS.map((item) => renderNavItem(item, { closeSidebar: true }))}
                </nav>
              </aside>
            </TooltipProvider>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 z-30">
        {NAV_ITEMS.slice(0, 5).map((item) => renderNavItem(item, { mobile: true }))}
      </nav>
    </div>
  );
};

export default StudentLayout;
