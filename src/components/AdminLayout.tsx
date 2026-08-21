import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import ThemeToggle from "@/components/ThemeToggle";
import ScrollToTop from "@/components/ScrollToTop";
import SEO from "@/components/SEO";
import NotificationsBell from "@/components/NotificationsBell";
import { Badge } from "@/components/ui/badge";
import { usePendingAdmissionsCount } from "@/hooks/use-pending-admissions";
import { preloadPath, preloadPortal } from "@/routes/lazy-pages";
import { isNavActive, normalizePortalPath } from "@/lib/nav";
import NavSection from "@/components/portal/NavSection";
import CommandPalette, { CommandPaletteTrigger } from "@/components/portal/CommandPalette";
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
  BarChart3,
  ShieldCheck,
  MoreHorizontal,
  ClipboardCheck,
  Mail,
  HardDrive,
  BadgeDollarSign,
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
    items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" }],
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
    id: "academics",
    title: "Academics",
    items: [
      { label: "Courses", icon: BookOpen, path: "/admin/courses" },
      { label: "Attendance", icon: CalendarCheck, path: "/admin/attendance" },
      { label: "Tasks", icon: FileText, path: "/admin/assignments" },
      { label: "Exams", icon: ClipboardCheck, path: "/admin/exams" },
      { label: "Materials", icon: Folder, path: "/admin/materials" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    items: [
      { label: "Fees", icon: CreditCard, path: "/admin/fees" },
      { label: "Payments", icon: BadgeDollarSign, path: "/admin/payments" },
    ],
  },
  {
    id: "communication",
    title: "Communication",
    items: [
      { label: "Announcements", icon: Bell, path: "/admin/announcements" },
      { label: "Calendar", icon: CalendarDays, path: "/admin/calendar" },
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
      { label: "Settings", icon: Settings, path: "/admin/settings" },
      { label: "Profile", icon: UserCircle, path: "/admin/profile" },
    ],
  },
];

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

const NAV_PATHS = NAV_ITEMS.map((item) => item.path);

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
  "/admin/storage",
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
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          active ? "gradient-flame text-accent-foreground shadow-md" : "text-primary-foreground/80 hover:bg-primary-foreground/10"
        }`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {showBadge && (
          <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive h-5 min-w-5 px-1.5 text-[10px] font-bold">
            {pendingCount}
          </Badge>
        )}
      </Link>
    );
  };

  const renderSidebarGroups = (onNavigate?: () => void) =>
    visibleGroups.map((group) =>
      group.title === null ? (
        <div key={group.id} className="space-y-1">
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

  return (
    <div className="flex min-h-screen supports-[min-height:100dvh]:min-h-[100dvh] flex-col bg-background">
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
      <header className="h-14 border-b border-border bg-card flex items-center justify-between gap-2 px-3 sm:px-4 shrink-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            className="md:hidden -ml-1 p-1 text-foreground"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={sidebarOpen}
            aria-controls="admin-mobile-nav"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/admin/dashboard" className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            {/* The mark alone on a phone, where the wordmark and the page
                title would fight for the same row. */}
            <img src="/images/school-logo.png" alt="" className="h-8 w-8 object-contain" />
            <span className="hidden sm:inline">SLSM Admin</span>
          </Link>
        </div>
        <h1 className="hidden min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground tracking-wide sm:block">Admin Portal</h1>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <CommandPaletteTrigger onClick={() => palette.setOpen(true)} />
          <span className="text-sm text-muted-foreground hidden sm:block">
            {authProfile ? `${authProfile.first_name || 'Admin'} ${authProfile.last_name || 'User'}` : ""}
          </span>
          <Avatar className="h-8 w-8">
            {authProfile?.avatar_url && <AvatarImage src={authProfile.avatar_url} alt="Avatar" />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          {student && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/student/dashboard")}
                className="hidden sm:flex items-center gap-1.5 text-xs"
              >
                <Users className="w-3.5 h-3.5" />
                Student Portal
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/student/dashboard")}
                className="sm:hidden"
                title="Student Portal"
              >
                <Eye className="w-4 h-4" />
              </Button>
            </>
          )}
          <NotificationsBell />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="hidden md:flex flex-col w-56 shrink-0 gradient-purple text-primary-foreground overflow-y-auto">
          <nav className="flex-1 py-4 px-2" aria-label="Admin sections">
            {renderSidebarGroups()}
          </nav>
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
              className="absolute left-0 top-0 bottom-0 w-60 gradient-purple text-primary-foreground overflow-y-auto pt-14"
              onClick={(e) => e.stopPropagation()}
            >
              <nav className="py-4 px-2" aria-label="Admin sections">
                {renderSidebarGroups(closeSidebar)}
              </nav>
            </aside>
          </div>
        )}

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
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around pt-2 pb-safe z-30" aria-label="Primary">
        {mobilePrimary.map((item) => {
          const active = isNavActive(location.pathname, item.path, NAV_PATHS);
          const showBadge = item.path === "/admin/admissions" && pendingCount > 0;
          return (
            <Link key={item.path} to={item.path} {...prefetch(item.path)} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center gap-0.5 text-[10px] ${active ? "text-accent" : "text-muted-foreground"}`}>
              <item.icon className="w-5 h-5" />
              {item.shortLabel ?? item.label.split(" ")[0]}
              {showBadge && (
                <span className="absolute -top-1 right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
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
