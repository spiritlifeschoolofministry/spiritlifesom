import { useMemo, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/useAuth";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  ClipboardList,
  FileText,
  Users,
  CreditCard,
  Bell,
  UserCircle,
  LogOut,
  Menu,
  X,
  Lock,
  AlertTriangle,
  XCircle,
  Shield,
  Eye,
  GraduationCap,
  Award,
} from "lucide-react";
import { toast } from "sonner";

interface StudentLayoutProps {
  children: React.ReactNode;
  admissionStatus?: string | null;
}

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/student/dashboard", restrictedWhenPending: false },
  { label: "My Courses", icon: BookOpen, path: "/student/courses", restrictedWhenPending: false },
  { label: "Timetable", icon: CalendarClock, path: "/student/timetable", restrictedWhenPending: false },
  { label: "Attendance", icon: CalendarCheck, path: "/student/attendance", restrictedWhenPending: false },
  { label: "Tasks", icon: ClipboardList, path: "/student/assignments", restrictedWhenPending: true },
  { label: "Grades", icon: GraduationCap, path: "/student/grades", restrictedWhenPending: true },
  { label: "Transcript", icon: FileText, path: "/student/transcript", restrictedWhenPending: true },
  { label: "Course Materials", icon: FileText, path: "/student/materials", restrictedWhenPending: true },
  { label: "Course Mates", icon: Users, path: "/student/coursemates", restrictedWhenPending: true },
  { label: "Fees", icon: CreditCard, path: "/student/fees", restrictedWhenPending: false },
  { label: "Notifications", icon: Bell, path: "/student/notifications", restrictedWhenPending: false },
  { label: "Announcements", icon: Bell, path: "/student/announcements", restrictedWhenPending: false },
  { label: "Calendar", icon: CalendarDays, path: "/student/calendar", restrictedWhenPending: false },
  { label: "Certificate", icon: Award, path: "/student/certificate", restrictedWhenPending: false },
  { label: "Graduates", icon: GraduationCap, path: "/student/graduates", restrictedWhenPending: false },
  { label: "Profile", icon: UserCircle, path: "/student/profile", restrictedWhenPending: false },
];

const StudentLayout = ({ children, admissionStatus }: StudentLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile: authProfile, student, role } = useAuth();
  const derivedAdmission = student?.admission_status ?? undefined;
  const effectiveAdmissionStatus = admissionStatus ?? derivedAdmission ?? null;
  const statusUpper = useMemo(
    () => (effectiveAdmissionStatus ?? "").toString().toUpperCase(),
    [effectiveAdmissionStatus]
  );
  const isPending = statusUpper === "PENDING";
  const isRejected = statusUpper === "REJECTED";
  const isGraduate = statusUpper === "GRADUATE";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const unreadCount = useUnreadNotifications();

  // Case-insensitive role check for admin access
  const isAdmin = (role ?? "").toLowerCase() === "admin" || (role ?? "").toLowerCase() === "teacher";

  const handleLogout = async () => {
    await signOut();
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  const initials = authProfile ? `${(authProfile.first_name || 'S')[0]}${(authProfile.last_name || 'U')[0]}` : "";

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
        <Link key={item.path} to={item.path} className={`flex flex-col items-center gap-0.5 text-[10px] relative ${active ? "text-accent" : "text-muted-foreground"}`}>
          <div className="relative">
            <item.icon className="w-5 h-5" />
            {item.label === "Notifications" && unreadCount > 0 && (
              <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
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

    const isNotification = item.label === "Notifications";

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={opts.closeSidebar ? () => setSidebarOpen(false) : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
          active ? "gradient-flame text-accent-foreground shadow-md" : "text-primary-foreground/80 hover:bg-primary-foreground/10"
        }`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
        {isNotification && unreadCount > 0 && (
          <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Nav */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <Button variant="ghost" size="icon" onClick={() => navigate("/student/notifications")} title="Notifications" className="relative">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
          <button className="md:hidden text-foreground" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/student/dashboard" className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight hidden sm:flex">
            <img src="/images/school-logo.png" alt="" className="h-8 w-8 object-contain" />
            SLSM
          </Link>
        </div>
        <h1 className="text-sm font-semibold text-foreground tracking-wide">Student Portal</h1>
        <div className="flex items-center gap-3">
          {/* Admin Portal Switch */}
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin")} className="hidden sm:flex items-center gap-1.5 text-xs">
                <Shield className="w-3.5 h-3.5" />
                Admin Portal
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin")}
                className="sm:hidden"
                title="Admin Portal"
              >
                <Eye className="w-4 h-4" />
              </Button>
            </>
          )}
          <span className="text-sm text-muted-foreground hidden sm:block">
            {authProfile ? `${authProfile.first_name || 'Student'} ${authProfile.last_name || 'User'}` : ""}
          </span>
          <Avatar className="h-8 w-8">
            {authProfile?.avatar_url && <AvatarImage src={authProfile.avatar_url} alt="Avatar" />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <ThemeToggle />
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
      {isGraduate && (
        <div className="bg-primary/10 border-b border-primary/30 text-primary px-4 py-3 flex items-center gap-3 shrink-0">
          <GraduationCap className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">
            🎓 Congratulations! You have graduated from Spirit Life School of Ministry. Your records are available for reference.
          </p>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar - desktop */}
        <TooltipProvider>
          <aside className="hidden md:flex flex-col w-56 shrink-0 gradient-purple text-primary-foreground overflow-y-auto">
            <nav className="flex-1 py-4 space-y-1 px-2">
              {NAV_ITEMS.map((item) => renderNavItem(item, {}))}
              {/* Admin link in sidebar for admins/teachers */}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary-foreground/80 hover:bg-primary-foreground/10 mt-4 border-t border-primary-foreground/20 pt-4"
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  Admin Portal
                </Link>
              )}
            </nav>
          </aside>
        </TooltipProvider>

        {/* Sidebar - mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <TooltipProvider>
              <aside className="absolute left-0 top-14 bottom-0 w-60 gradient-purple text-primary-foreground overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <nav className="py-4 space-y-1 px-2">
                  {NAV_ITEMS.map((item) => renderNavItem(item, { closeSidebar: true }))}
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setSidebarOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary-foreground/80 hover:bg-primary-foreground/10 mt-4 border-t border-primary-foreground/20 pt-4"
                    >
                      <Shield className="w-4 h-4 shrink-0" />
                      Admin Portal
                    </Link>
                  )}
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
