import { useEffect, useMemo, useState, useRef, useCallback, Suspense } from "react";
import PageTransition from "@/components/motion/PageTransition";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationsBell from "@/components/NotificationsBell";
import MoreSheet from "@/components/redesign/student/MoreSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import ScrollToTop from "@/components/ScrollToTop";
import SEO from "@/components/SEO";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/useAuth";
import { preloadPath, preloadPortal } from "@/routes/lazy-pages";
import { trackView } from "@/lib/activity";
import { isNavActive, normalizePortalPath } from "@/lib/nav";
import { useFocusTrap } from "@/hooks/use-focus-trap";

import NavSection from "@/components/portal/NavSection";
import CommandPalette, { CommandPaletteTrigger } from "@/components/portal/CommandPalette";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileCheck,
  Sparkles,
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
    title: "Learn",
    items: [
      { label: "My Courses", icon: BookOpen, path: "/student/courses", restrictedWhenPending: false },
      { label: "Course Materials", icon: FileText, path: "/student/materials", restrictedWhenPending: true },
      { label: "Tasks", icon: ClipboardList, path: "/student/assignments", restrictedWhenPending: true },
      { label: "Study", icon: Sparkles, path: "/student/study", restrictedWhenPending: true },
    ],
  },
  {
    // Its own section: several papers often share one window on the same
    // day, and students need to find them in one tap, not under "Learn".
    id: "exams",
    title: "Exams",
    items: [
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

/**
 * Exported for `portal-map.test.ts`, which asserts every page a student can
 * navigate to has a description in `portal-map.ts` and vice versa. That is what
 * keeps the assistant's navigational answers true without a second list to
 * maintain by hand.
 */
export const STUDENT_NAV_PATHS = NAV_PATHS;

/**
 * The phone bottom bar: one tab per section rather than one per page. A tab is
 * current whenever the page you are on belongs to its section, and within a
 * section the pages sit in a tab strip at the top of the content.
 */
const MOBILE_TABS: { label: string; icon: LucideIcon; path: string; group: string }[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/student/dashboard", group: "overview" },
  { label: "Learn", icon: BookOpen, path: "/student/courses", group: "learning" },
  { label: "Exams", icon: FileCheck, path: "/student/exams", group: "exams" },
  { label: "Record", icon: GraduationCap, path: "/student/attendance", group: "record" },
];

/** The section a path belongs to, by the longest matching nav path. */
const groupForPath = (pathname: string): NavGroup | undefined => {
  const match = NAV_ITEMS
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match ? NAV_GROUPS.find((group) => group.items.includes(match)) : undefined;
};

const StudentLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile: authProfile, student, role } = useAuth();
  const effectiveAdmissionStatus = student?.admission_status ?? null;
  // Stamped on this student's page views so engagement can be read per cohort.
  const cohortId = student?.cohort_id ?? null;
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
  const isMobile = useIsMobile();
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

  // Count the page view. Fire-and-forget, keyed on the path so a re-render
  // does not count a second visit — see src/lib/activity.ts.
  useEffect(() => {
    trackView(location.pathname, "student", cohortId);
  }, [location.pathname, cohortId]);

  /** Bottom of the sidebar: "Switch to admin" for staff, "Sign out" for students. */
  const sidebarFooter = (closeOnNavigate?: boolean) => (
    <div className="mt-auto border-t border-primary-foreground/15 p-3">
      {isAdmin ? (
        <Link
          to="/admin"
          onClick={closeOnNavigate ? () => setSidebarOpen(false) : undefined}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl gradient-flame px-3 text-sm font-bold shadow-md transition-opacity hover:opacity-90"
        >
          <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
          Switch to admin
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-primary-foreground/30 px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      )}
    </div>
  );

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

  const currentGroup = groupForPath(location.pathname);
  const onToday = normalizePortalPath(location.pathname) === "/student/dashboard";

  const renderMobileTab = (tab: (typeof MOBILE_TABS)[number]) => {
    const active = currentGroup?.id === tab.group;
    const target = NAV_ITEMS.find((item) => item.path === tab.path);
    if (isPending && target?.restrictedWhenPending) {
      return (
        <span
          key={tab.path}
          aria-disabled="true"
          title="Available after admission approval"
          className="flex min-h-[52px] min-w-16 cursor-not-allowed flex-col items-center justify-center gap-[3px] text-[11px] font-medium text-muted-foreground/50"
        >
          <span className="flex h-7 w-11 items-center justify-center">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </span>
          {tab.label}
          <span className="sr-only"> (locked until admission)</span>
        </span>
      );
    }
    return (
      <Link
        key={tab.path}
        to={tab.path}
        {...prefetch(tab.path)}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[52px] min-w-16 flex-col items-center justify-center gap-[3px] rounded-xl text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active ? "font-bold text-secondary-foreground" : "font-medium text-muted-foreground"
        }`}
      >
        <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${active ? "bg-secondary" : ""}`}>
          <tab.icon className="w-5 h-5" aria-hidden="true" />
        </span>
        {tab.label}
      </Link>
    );
  };

  // On phones, the pages of the current section (Learn: courses, materials,
  // tasks, study; Record: attendance, assessments, transcript, certificate,
  // fees; …) sit in a tab strip above the content, one tap apart.
  const sectionTabs =
    currentGroup && currentGroup.items.length > 1 ? (
      <nav aria-label={`${currentGroup.title ?? "Section"} pages`} className="md:hidden -mx-4 mb-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <ul className="flex w-max gap-2">
          {currentGroup.items.map((item) => {
            const active = isNavActive(location.pathname, item.path, NAV_PATHS);
            const restricted = isPending && item.restrictedWhenPending;
            return (
              <li key={item.path}>
                {restricted ? (
                  <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-muted-foreground/50">
                    <Lock className="h-3.5 w-3.5" /> {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.path}
                    {...prefetch(item.path)}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                      active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    ) : null;

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
    <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] flex-col bg-background">
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
      {/* Staff previewing the student portal: say so, and the way back. */}
      {isAdmin && (
        <div className="flex shrink-0 items-center justify-between gap-2 bg-primary py-1 pl-4 pr-3 text-primary-foreground">
          <span className="text-[13px] font-bold">Viewing as a student (staff preview)</span>
          <Link
            to="/admin"
            className="flex min-h-11 shrink-0 items-center rounded-[10px] bg-[#17112B] px-3 text-[13px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17112B] focus-visible:ring-offset-2 focus-visible:ring-offset-primary md:min-h-9"
          >
            Back to admin
          </Link>
        </div>
      )}
      {/* Top Nav */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between gap-2 px-3 sm:px-4 shrink-0 z-30">
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <button
            className="md:hidden -ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-foreground hover:bg-muted"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={sidebarOpen}
            aria-controls="student-mobile-nav"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/student/dashboard" aria-label="SLSM, go to Today" className="flex items-center gap-2 text-primary font-extrabold text-lg tracking-tight">
            {/* The mark alone on a phone, where the wordmark and the page
                title would fight for the same row. */}
            <img src="/images/school-logo.png" alt="" className="h-8 w-8 object-contain" />
            <span className="hidden sm:inline">SLSM</span>
          </Link>
        </div>
        <h1 className="hidden min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground tracking-wide sm:block">Student Portal</h1>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
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
                className="h-11 w-11 sm:hidden"
                title="Admin Portal"
                aria-label="Admin Portal"
              >
                <Eye className="w-4 h-4" />
              </Button>
            </>
          )}
          {/* Today carries its own bell beside the greeting. */}
          {!onToday && (
            <div className="[&>button]:h-11 [&>button]:w-11">
              <NotificationsBell />
            </div>
          )}
          <span className="text-sm text-muted-foreground hidden sm:block">
            {fullName || "Student"}
          </span>
          {/* On phones the profile, appearance and sign out live in More. */}
          <Avatar className="hidden h-8 w-8 sm:flex">
            {authProfile?.avatar_url && <AvatarImage src={authProfile.avatar_url} alt="Avatar" />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          {!isMobile && <ThemeToggle />}
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" aria-label="Log out" className="hidden h-11 w-11 md:inline-flex">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Admission Status Banner */}
      {/* Today shows a pending applicant the full tracker instead. */}
      {isPending && !onToday && (
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
          <aside className="hidden md:flex flex-col w-56 shrink-0 gradient-purple text-primary-foreground">
            <nav className="flex-1 overflow-y-auto py-4 px-2" aria-label="Student sections">
              {renderSidebarGroups()}
            </nav>
            {/* Pinned to the bottom of the full-height sidebar: staff switch back
                to the admin portal, students sign out. */}
            {sidebarFooter()}
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
                className="absolute left-0 top-0 bottom-0 flex w-60 flex-col gradient-purple text-primary-foreground pt-14 pb-[env(safe-area-inset-bottom)]"
                onClick={(e) => e.stopPropagation()}
              >
                <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-2" aria-label="Student sections">
                  {renderSidebarGroups(true)}
                </nav>
                {sidebarFooter(true)}
              </aside>
            </TooltipProvider>
          </div>
        )}

        {/* Main content */}
        <main id="student-main" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-nav">
          {/* Boundary lives inside the shell so a lazy page load only replaces
              the content area — the header and sidebar stay put. */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
              </div>
            }
          >
            {sectionTabs}
            <PageTransition routeKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </Suspense>
        </main>
      </div>

      {/* Phone bottom bar: one tab per section, then More (Community and
          Account, staff's way back to admin, sign out) in a sheet. */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-border bg-card px-1 pt-1.5 pb-safe" aria-label="Primary">
        {MOBILE_TABS.map(renderMobileTab)}
        <MoreSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          active={currentGroup?.id === "community" || currentGroup?.id === "account"}
          community={(NAV_GROUPS.find((group) => group.id === "community")?.items ?? []).map((item) => ({
            label: item.label,
            icon: item.icon,
            path: item.path,
            locked: isPending && item.restrictedWhenPending,
          }))}
          fullName={fullName}
          initials={initials}
          avatarUrl={authProfile?.avatar_url ?? null}
          subtitle={[student?.student_code, student?.learning_mode].filter(Boolean).join(" · ")}
          whatsappOn={authProfile ? !authProfile.whatsapp_opted_out_at : null}
          isStaff={isAdmin}
          onSignOut={handleLogout}
        />
      </nav>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} groups={paletteGroups} />
      <ScrollToTop />
    </div>
  );
};

export default StudentLayout;
