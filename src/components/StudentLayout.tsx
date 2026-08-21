import { useEffect, useMemo, useState, useRef, useCallback, Suspense } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import ScrollToTop from "@/components/ScrollToTop";
import SEO from "@/components/SEO";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/useAuth";
import { preloadPath, preloadPortal } from "@/routes/lazy-pages";
import { isNavActive, normalizePortalPath } from "@/lib/nav";
import { useFocusTrap } from "@/hooks/use-focus-trap";

import NavSection from "@/components/portal/NavSection";
import CommandPalette, { CommandPaletteTrigger } from "@/components/portal/CommandPalette";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileCheck,
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
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  restrictedWhenPending: boolean;
}

interface NavGroup {
  id: string;
  /** null renders the items with no heading, above the labelled sections. */
  title: string | null;
  items: NavItem[];
}

/**
 * Sidebar structure. The dashboard sits ungrouped at the top; the rest is
 * grouped by what a student is trying to do — study, check their record, keep
 * up with the school.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    title: null,
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/student/dashboard", restrictedWhenPending: false },
    ],
  },
  {
    id: "learning",
    title: "Learning",
    items: [
      { label: "My Courses", icon: BookOpen, path: "/student/courses", restrictedWhenPending: false },
      { label: "Course Materials", icon: FileText, path: "/student/materials", restrictedWhenPending: true },
      { label: "Tasks", icon: ClipboardList, path: "/student/assignments", restrictedWhenPending: true },
      { label: "Exams", icon: FileCheck, path: "/student/exams", restrictedWhenPending: true },
    ],
  },
  {
    id: "record",
    title: "My Record",
    items: [
      { label: "Attendance", icon: CalendarCheck, path: "/student/attendance", restrictedWhenPending: false },
      // One place for every assessment the student has ever taken — coursework
      // and anything sat through the exam engine. The path is unchanged so
      // existing links and bookmarks still resolve.
      { label: "Assessments", icon: GraduationCap, path: "/student/grades", restrictedWhenPending: true },
      { label: "Transcript", icon: FileText, path: "/student/transcript", restrictedWhenPending: true },
      { label: "Certificate", icon: Award, path: "/student/certificate", restrictedWhenPending: false },
      { label: "Fees", icon: CreditCard, path: "/student/fees", restrictedWhenPending: false },
    ],
  },
  {
    id: "community",
    title: "Community",
    items: [
      { label: "Announcements", icon: Bell, path: "/student/announcements", restrictedWhenPending: false },
      { label: "Calendar", icon: CalendarDays, path: "/student/calendar", restrictedWhenPending: false },
      { label: "Course Mates", icon: Users, path: "/student/coursemates", restrictedWhenPending: true },
      { label: "Graduates", icon: GraduationCap, path: "/student/graduates", restrictedWhenPending: false },
    ],
  },
  {
    id: "account",
    title: "Account",
    items: [
      { label: "Profile", icon: UserCircle, path: "/student/profile", restrictedWhenPending: false },
    ],
  },
];

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

const NAV_PATHS = NAV_ITEMS.map((item) => item.path);

/** The four paths pinned to the mobile bottom bar, in order. */
const MOBILE_PRIMARY_PATHS = [
  "/student/dashboard",
  "/student/courses",
  "/student/attendance",
  "/student/assignments",
];

const StudentLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile: authProfile, student, role } = useAuth();
  const effectiveAdmissionStatus = student?.admission_status ?? null;
  const statusUpper = useMemo(
    () => (effectiveAdmissionStatus ?? "").toString().toUpperCase(),
    [effectiveAdmissionStatus]
  );
  const isPending = statusUpper === "PENDING";
  const isRejected = statusUpper === "REJECTED";
  const isGraduate = statusUpper === "GRADUATE";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const palette = useCommandPalette();
  const touchStartX = useRef<number | null>(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const drawerRef = useFocusTrap<HTMLElement>(sidebarOpen, closeSidebar);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current !== null) {
      const diff = touchStartX.current - e.changedTouches[0].clientX;
      if (diff > 60) setSidebarOpen(false);
      touchStartX.current = null;
    }
  }, []);


  // Case-insensitive role check for admin access
  const isAdmin = (role ?? "").toLowerCase() === "admin" || (role ?? "").toLowerCase() === "teacher";

  // Warm the other portal pages' chunks while the browser is idle so switching
  // pages doesn't wait on a download.
  useEffect(() => { preloadPortal("/student"); }, []);

  const handleLogout = async () => {
    await signOut();
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  // Fetch a page's chunk as soon as the user shows intent to visit it.
  const prefetch = (path: string) => ({
    onMouseEnter: () => preloadPath(path),
    onFocus: () => preloadPath(path),
    onTouchStart: () => preloadPath(path),
  });

  const fullName = authProfile ? [authProfile.first_name, authProfile.middle_name, authProfile.last_name].filter(Boolean).join(' ') : "";
  const initials = authProfile ? `${(authProfile.first_name || 'S')[0]}${(authProfile.last_name || 'U')[0]}` : "";

  const renderNavItem = (item: NavItem, opts: { mobile?: boolean; closeSidebar?: boolean }) => {
    const active = isNavActive(location.pathname, item.path, NAV_PATHS);
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
        <Link key={item.path} to={item.path} {...prefetch(item.path)} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 text-[10px] relative ${active ? "text-accent" : "text-muted-foreground"}`}>
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
        {...prefetch(item.path)}
        onClick={opts.closeSidebar ? closeSidebar : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
          active ? "gradient-flame text-accent-foreground shadow-md" : "text-primary-foreground/80 hover:bg-primary-foreground/10"
        }`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
      </Link>
    );
  };

  const renderSidebarGroups = (closeOnNavigate?: boolean) =>
    NAV_GROUPS.map((group) =>
      group.title === null ? (
        <div key={group.id} className="space-y-1">
          {group.items.map((item) => renderNavItem(item, { closeSidebar: closeOnNavigate }))}
        </div>
      ) : (
        <NavSection key={group.id} id={`student-${group.id}`} title={group.title}>
          {group.items.map((item) => renderNavItem(item, { closeSidebar: closeOnNavigate }))}
        </NavSection>
      )
    );

  // Pinned rather than "the first four", so regrouping the sidebar never
  // silently changes what the bottom bar offers.
  const mobilePrimary = MOBILE_PRIMARY_PATHS.map(
    (path) => NAV_ITEMS.find((item) => item.path === path)
  ).filter((item): item is NavItem => Boolean(item));

  const paletteGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          disabled: isPending && item.restrictedWhenPending,
        })),
      })),
    [isPending]
  );

  const getPageTitle = () => {
    // Check main nav items first
    // Exact match only: the sub-route cases below give deep pages their own
    // titles, which a prefix match here would shadow.
    const currentItem = NAV_ITEMS.find(item => normalizePortalPath(location.pathname) === item.path);
    if (currentItem) return `${currentItem.label} | Student Portal`;

    // Handle sub-routes or dynamic routes
    if (location.pathname.startsWith('/student/exams/')) {
      if (location.pathname.includes('/lobby')) return 'Exam Lobby | Student Portal';
      if (location.pathname.includes('/take')) return 'Exam Session | Student Portal';
      return 'Exams | Student Portal';
    }

    return "Student Portal | SLSOM";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <a
        href="#student-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <SEO 
        title={getPageTitle()} 
        description="Student portal for Spirit Life School of Ministry." 
        noindex 
      />
      {/* Top Nav */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden text-foreground"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={sidebarOpen}
            aria-controls="student-mobile-nav"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/student/dashboard" className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight hidden sm:flex">
            <img src="/images/school-logo.png" alt="" className="h-8 w-8 object-contain" />
            SLSM
          </Link>
        </div>
        <h1 className="text-sm font-semibold text-foreground tracking-wide">Student Portal</h1>
        <div className="flex items-center gap-3">
          <CommandPaletteTrigger onClick={() => palette.setOpen(true)} />
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
            {fullName || "Student"}
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
          <aside className="hidden md:flex flex-col w-56 shrink-0 h-full gradient-purple text-primary-foreground overflow-y-auto">
            <nav className="flex-1 py-4 px-2" aria-label="Student sections">
              {renderSidebarGroups()}
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
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div className="absolute inset-0 bg-black/50" />
            <TooltipProvider>
              <aside
                ref={drawerRef}
                id="student-mobile-nav"
                role="dialog"
                aria-modal="true"
                aria-label="Student navigation"
                className="absolute left-0 top-0 bottom-0 w-60 gradient-purple text-primary-foreground overflow-y-auto pt-14"
                onClick={(e) => e.stopPropagation()}
              >
                <nav className="py-4 px-2" aria-label="Student sections">
                  {renderSidebarGroups(true)}
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
        <main id="student-main" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-20 md:pb-6">
          {/* Boundary lives inside the shell so a lazy page load only replaces
              the content area — the header and sidebar stay put. */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav with sheet for all items */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around py-2 z-30" aria-label="Primary">
        {mobilePrimary.map((item) => renderNavItem(item, { mobile: true }))}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
              <MoreHorizontal className="w-5 h-5" />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="text-left">Navigation</SheetTitle>
            </SheetHeader>
            <div className="space-y-5 pt-4 pb-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.id}>
                  {group.title && (
                    <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </h3>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    {group.items.map((item) => {
                      const active = isNavActive(location.pathname, item.path, NAV_PATHS);
                      const restricted = isPending && item.restrictedWhenPending;
                      if (restricted) {
                        return (
                          <span key={item.path} className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-muted-foreground/40 cursor-not-allowed">
                            <Lock className="w-5 h-5" />
                            <span className="text-[11px] text-center leading-tight">{item.label}</span>
                          </span>
                        );
                      }
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          {...prefetch(item.path)}
                          onClick={() => setSheetOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                            active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <item.icon className="w-5 h-5" />
                          <span className="text-[11px] text-center leading-tight">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} groups={paletteGroups} />
      <ScrollToTop />
    </div>
  );
};

export default StudentLayout;
