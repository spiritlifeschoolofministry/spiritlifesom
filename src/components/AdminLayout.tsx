import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import PageTransition from "@/components/motion/PageTransition";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import ThemeToggle from "@/components/ThemeToggle";
import ScrollToTop from "@/components/ScrollToTop";
import SEO from "@/components/SEO";
import NotificationsBell from "@/components/NotificationsBell";
import { usePendingAdmissionsCount } from "@/hooks/use-pending-admissions";
import { preloadPath, preloadPortal } from "@/routes/lazy-pages";
import { trackView } from "@/lib/activity";
import { isNavActive, normalizePortalPath } from "@/lib/nav";
import NavSection from "@/components/portal/NavSection";
import CommandPalette from "@/components/portal/CommandPalette";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  CalendarDays,
  FileText,
  Folder,
  BookOpen,
  CreditCard,
  Bell,
  Settings,
  UserCircle,
  LogOut,
  Menu,
  X,
  Eye,
  Search,
  BarChart3,
  ShieldCheck,
  MoreHorizontal,
  ClipboardCheck,
  Mail,
  HardDrive,
  Sparkles,
  BadgeDollarSign,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Sidebar structure. The first group is unlabelled so the dashboard sits on its
 * own above the sections; everything else is grouped by what the work is about.
 */
interface NavItem {
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  path: string;
}

interface NavGroup {
  id: string;
  /** null renders the items with no heading, above the labelled sections. */
  title: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    title: null,
    items: [{ label: "Home", icon: LayoutDashboard, path: "/admin/dashboard" }],
  },
  {
    id: "people",
    title: "People",
    items: [
      { label: "Students", icon: Users, path: "/admin/students" },
      { label: "Admissions/Requests", shortLabel: "Admissions", icon: UserCheck, path: "/admin/admissions" },
    ],
  },
  {
    // The week-to-week work of running classes.
    id: "teaching",
    title: "Teaching",
    items: [
      { label: "Courses", icon: BookOpen, path: "/admin/courses" },
      { label: "Attendance", icon: CalendarCheck, path: "/admin/attendance" },
      { label: "Tasks", icon: FileText, path: "/admin/assignments" },
      // Its own item, not a corner of the exams page: these questions are never
      // on a paper, and somebody looking for them was looking under Exams for a
      // thing that is not an exam.
      { label: "Practice Questions", shortLabel: "Practice", icon: Sparkles, path: "/admin/practice" },
      { label: "Materials", icon: Folder, path: "/admin/materials" },
      { label: "Calendar", icon: CalendarDays, path: "/admin/calendar" },
    ],
  },
  {
    // Exams get their own section: building, monitoring and marking papers is
    // a job of its own, and the marking backlog lives here.
    id: "exams",
    title: "Exams",
    items: [{ label: "Exams", icon: ClipboardCheck, path: "/admin/exams" }],
  },
  {
    id: "money",
    title: "Money",
    items: [
      { label: "Fees", icon: CreditCard, path: "/admin/fees" },
      { label: "Payments", icon: BadgeDollarSign, path: "/admin/payments" },
    ],
  },
  {
    // Everything that goes out to students.
    id: "reach",
    title: "Reach",
    items: [
      { label: "Announcements", icon: Bell, path: "/admin/announcements" },
      { label: "Email History", icon: Mail, path: "/admin/email-history" },
    ],
  },
  {
    id: "insights",
    title: "Insights",
    items: [
      { label: "Analytics", icon: BarChart3, path: "/admin/analytics" },
      { label: "Audit Log", icon: ShieldCheck, path: "/admin/audit" },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      { label: "Storage", icon: HardDrive, path: "/admin/storage" },
      { label: "AI", icon: Sparkles, path: "/admin/ai" },
      { label: "WhatsApp", icon: MessageCircle, path: "/admin/whatsapp" },
      { label: "Settings", icon: Settings, path: "/admin/settings" },
      { label: "Profile", icon: UserCircle, path: "/admin/profile" },
    ],
  },
];

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

const NAV_PATHS = NAV_ITEMS.map((item) => item.path);

/** Exported for `portal-map.test.ts`. See STUDENT_NAV_PATHS for why. */
export const ADMIN_NAV_PATHS = NAV_PATHS;

/** The four paths pinned to the mobile bottom bar, in order. */
const MOBILE_PRIMARY_PATHS = [
  "/admin/dashboard",
  "/admin/students",
  "/admin/admissions",
  "/admin/attendance",
];

/** Routes gated on strict admin (ProtectedRoute requiredRole="superadmin"). */
const ADMIN_ONLY_PATHS = new Set([
  "/admin/settings",
  "/admin/whatsapp",
  "/admin/storage",
  "/admin/ai",
  "/admin/audit",
  "/admin/email-history",
]);

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile: authProfile, signOut, student, role } = useAuth();
  const isAdmin = (role ?? "").toLowerCase() === "admin" || (role ?? "").toLowerCase() === "teacher";
  const pendingCount = usePendingAdmissionsCount(isAdmin);
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

  // Warm the other admin pages' chunks while the browser is idle so switching
  // pages doesn't wait on a download.
  useEffect(() => { preloadPortal("/admin"); }, []);

  // Count the page view. Fire-and-forget, keyed on the path so a re-render
  // does not count a second visit — see src/lib/activity.ts.
  useEffect(() => {
    trackView(location.pathname, "admin", null);
  }, [location.pathname]);

  useEffect(() => {
    if (role && role.toLowerCase() !== "admin" && role.toLowerCase() !== "teacher") {
      toast.error("Unauthorized access");
      navigate("/student/dashboard");
    }
  }, [role, navigate]);

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

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const initials = authProfile ? `${(authProfile.first_name || 'A')[0]}${(authProfile.last_name || 'U')[0]}` : "";

  // Teachers reach the general admin routes; the superadmin-gated ones are
  // hidden from them rather than shown and then bounced by ProtectedRoute.
  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !ADMIN_ONLY_PATHS.has(item.path) || role?.toLowerCase() === "admin"
        ),
      })).filter((group) => group.items.length > 0),
    [role]
  );

  const visibleItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups]
  );

  // Pinned rather than "the first four", so regrouping the sidebar never
  // silently changes what the bottom bar offers.
  const mobilePrimary = useMemo(
    () =>
      MOBILE_PRIMARY_PATHS.map((path) => visibleItems.find((item) => item.path === path)).filter(
        (item): item is NavItem => Boolean(item)
      ),
    [visibleItems]
  );

  // The board's deep plum sidebar: text items, a lighter plum pill for the
  // current page and gold count badges where the shell already has a count.
  const renderSidebarLink = (item: NavItem, onNavigate?: () => void) => {
    const active = isNavActive(location.pathname, item.path, NAV_PATHS);
    const showBadge = item.path === "/admin/admissions" && pendingCount > 0;
    return (
      <Link
        key={item.path}
        to={item.path}
        {...prefetch(item.path)}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={showBadge ? `${item.label}, ${pendingCount} waiting` : undefined}
        className={`flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] ${
          active ? "bg-[#3A2B66] font-bold text-white" : "font-medium text-[#CFC9DE] hover:bg-white/5 hover:text-white"
        }`}
      >
        <item.icon className={`h-4 w-4 shrink-0 ${active ? "opacity-100" : "opacity-70"}`} aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        {showBadge && (
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#E0A526] px-1.5 text-xs font-extrabold text-[#17112B]">
            {pendingCount}
          </span>
        )}
      </Link>
    );
  };

  const renderSidebarGroups = (onNavigate?: () => void) =>
    visibleGroups.map((group) =>
      group.title === null ? (
        <div key={group.id} className="space-y-0.5 pb-1">
          {group.items.map((item) => renderSidebarLink(item, onNavigate))}
        </div>
      ) : (
        <NavSection key={group.id} id={`admin-${group.id}`} title={group.title}>
          {group.items.map((item) => renderSidebarLink(item, onNavigate))}
        </NavSection>
      )
    );

  const getPageTitle = () => {
    // Check main nav items first
    // Exact match only: the sub-route cases below give deep pages their own
    // titles, which a prefix match here would shadow.
    const currentItem = NAV_ITEMS.find(item => normalizePortalPath(location.pathname) === item.path);
    if (currentItem) return `${currentItem.label} | Admin Portal`;

    // Handle sub-routes or dynamic routes
    if (location.pathname.startsWith('/admin/students/')) return 'Student Detail | Admin Portal';
    if (location.pathname.startsWith('/admin/exams/')) {
       if (location.pathname.includes('/edit')) return 'Edit Exam | Admin Portal';
       if (location.pathname.includes('/new')) return 'New Exam | Admin Portal';
       if (location.pathname.includes('/monitor')) return 'Monitor Exam | Admin Portal';
       if (location.pathname.includes('/questions')) return 'Question Bank | Admin Portal';
       return 'Exams | Admin Portal';
    }
    if (location.pathname === '/admin/approve') return 'Approve Students | Admin Portal';
    if (location.pathname === '/admin/analytics') return 'Analytics | Admin Portal';
    if (location.pathname === '/admin/audit') return 'Audit Log | Admin Portal';
    if (location.pathname === '/admin/email-history') return 'Email History | Admin Portal';

    return "Admin Portal | SLSOM";
  };

  const fullName = authProfile
    ? `${authProfile.first_name || "Admin"} ${authProfile.last_name || "User"}`
    : "";
  const isStrictAdmin = role?.toLowerCase() === "admin";

  const brand = (onNavigate?: () => void) => (
    <Link
      to="/admin/dashboard"
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-[10px] px-2 py-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
    >
      <img src="/images/school-logo.png" alt="" className="h-8 w-8 rounded-lg bg-white object-contain" />
      <strong className="text-base font-extrabold tracking-tight">SLSOM Admin</strong>
    </Link>
  );

  const systemNote = isStrictAdmin ? (
    <p className="mt-auto rounded-xl bg-[#241C3D] p-3 text-[13px] leading-snug text-[#CFC9DE]">
      Superadmin tools (Storage, AI, WhatsApp, Settings) live under{" "}
      <strong className="text-white">System</strong>.
    </p>
  ) : null;

  // Round, bordered header buttons from the board. The theme toggle and the
  // bell are shared components, so they are restyled from the outside.
  const roundIcon =
    "[&>button]:h-11 [&>button]:w-11 [&>button]:rounded-full [&>button]:border [&>button]:border-border [&>button]:bg-card md:[&>button]:h-[42px] md:[&>button]:w-[42px]";

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] overflow-hidden bg-background">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <SEO 
        title={getPageTitle()} 
        description="Administrative portal for Spirit Life School of Ministry." 
        noindex 
      />

      {/* Deep plum sidebar, full height, as on the AdminHome board. */}
      <aside className="hidden w-60 shrink-0 flex-col gap-[18px] overflow-y-auto bg-[#17112B] px-3.5 py-5 text-white md:flex">
        {brand()}
        <nav className="flex flex-col" aria-label="Admin sections">
          {renderSidebarGroups()}
        </nav>
        {systemNote}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            ref={drawerRef}
            id="admin-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute bottom-0 left-0 top-0 flex w-64 flex-col gap-4 overflow-y-auto bg-[#17112B] px-3 py-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              {brand(closeSidebar)}
              <button
                type="button"
                onClick={closeSidebar}
                aria-label="Close navigation menu"
                className="flex h-11 w-11 items-center justify-center rounded-[10px] text-[#CFC9DE] hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col" aria-label="Admin sections">
              {renderSidebarGroups(closeSidebar)}
            </nav>
            {systemNote}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex shrink-0 items-center gap-1.5 border-b border-border bg-background px-3 py-2 sm:gap-2.5 sm:px-6 md:py-3 lg:px-8">
          <button
            type="button"
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-xl text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={sidebarOpen}
            aria-controls="admin-mobile-nav"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/admin/dashboard" className="shrink-0 md:hidden" aria-label="Admin home">
            <img src="/images/school-logo.png" alt="" className="h-8 w-8 object-contain" />
          </Link>

          {/* Ctrl/⌘K search: pages, actions and students by name. */}
          <button
            type="button"
            onClick={() => palette.setOpen(true)}
            aria-label="Find a student, page or action"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            className="flex h-11 w-11 shrink-0 items-center justify-center gap-3 rounded-xl border border-input bg-card text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:min-w-[260px] sm:justify-between sm:px-3.5"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Find a student, page or action</span>
            </span>
            <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-sans text-xs text-foreground/80 sm:inline">
              {isMac ? "⌘ K" : "Ctrl K"}
            </kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {student && (
              <Link
                to="/student/dashboard"
                aria-label="View as student"
                title="View as student"
                className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-primary bg-card text-sm font-bold text-secondary-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3.5 md:h-[42px] dark:text-foreground"
              >
                <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
                <span className="hidden sm:inline">View as student</span>
              </Link>
            )}
            <span className={roundIcon}>
              <NotificationsBell />
            </span>
            <span className={roundIcon}>
              <ThemeToggle />
            </span>
            <span className="hidden items-center gap-2 px-1 lg:flex">
              <Avatar className="h-9 w-9">
                {authProfile?.avatar_url && <AvatarImage src={authProfile.avatar_url} alt="" />}
                <AvatarFallback className="bg-secondary text-[13px] font-extrabold text-secondary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <span className="max-w-[160px] truncate text-sm font-semibold text-foreground">{fullName}</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-orange-200 bg-card px-2.5 text-sm font-bold text-orange-800 transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 md:h-[42px] dark:border-orange-900/70 dark:text-orange-300 dark:hover:bg-orange-950/40"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main id="admin-main" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-nav">
          {/* Boundary lives inside the shell so a lazy page load only replaces
              the content area — the header and sidebar stay put. */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
              </div>
            }
          >
            <PageTransition routeKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around pt-1 pb-safe z-30" aria-label="Primary">
        {mobilePrimary.map((item) => {
          const active = isNavActive(location.pathname, item.path, NAV_PATHS);
          const showBadge = item.path === "/admin/admissions" && pendingCount > 0;
          return (
            <Link key={item.path} to={item.path} {...prefetch(item.path)} aria-current={active ? "page" : undefined} aria-label={showBadge ? `${item.shortLabel ?? item.label}, ${pendingCount} waiting` : undefined} className={`relative flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "font-bold text-primary" : "text-muted-foreground"}`}>
              <item.icon className="w-5 h-5" aria-hidden="true" />
              {item.shortLabel ?? item.label.split(" ")[0]}
              {showBadge && (
                <span className="absolute -top-0.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E0A526] px-1 text-[10px] font-extrabold text-[#17112B]">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button type="button" className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="text-left">Navigation</SheetTitle>
            </SheetHeader>
            <div className="space-y-5 pt-4 pb-6">
              {visibleGroups.map((group) => (
                <div key={group.id}>
                  {group.title && (
                    <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </h3>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    {group.items.map((item) => {
                      const active = isNavActive(location.pathname, item.path, NAV_PATHS);
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
      <CommandPalette
        open={palette.open}
        onOpenChange={palette.setOpen}
        groups={visibleGroups}
        searchStudents
      />
      <ScrollToTop />
    </div>
  );
};

export default AdminLayout;
