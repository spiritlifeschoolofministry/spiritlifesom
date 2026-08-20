import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type Loader = () => Promise<{ default: ComponentType<unknown> }>;

export type LazyPage = LazyExoticComponent<ComponentType<unknown>> & {
  preload: () => Promise<unknown>;
};

/**
 * lazy() plus a `preload()` we can call ahead of navigation.
 *
 * Route changes render as React transitions (see the BrowserRouter future flag),
 * so the current screen stays visible while the next page's chunk downloads.
 * Warming that chunk on hover / idle is what makes the swap feel immediate
 * instead of "clicked, nothing happened, then the page appeared".
 */
export const lazyPage = (loader: Loader): LazyPage => {
  let started: Promise<unknown> | null = null;
  const preload = () => {
    if (!started) started = loader();
    return started;
  };
  // lazy() goes through preload() so an already-warmed chunk resolves instantly.
  const Component = lazy(preload as Loader) as LazyPage;
  Component.preload = preload;
  return Component;
};

// Public site — Home stays eagerly imported in App.tsx since it is the landing
// page; the rest split out so a first visit doesn't parse every marketing and
// auth page before it can paint.
export const About = lazyPage(() => import("@/pages/About"));
export const Courses = lazyPage(() => import("@/pages/Courses"));
export const Faculty = lazyPage(() => import("@/pages/Faculty"));
export const Contact = lazyPage(() => import("@/pages/Contact"));
export const Register = lazyPage(() => import("@/pages/Register"));
export const Login = lazyPage(() => import("@/pages/Login"));
export const ForgotPassword = lazyPage(() => import("@/pages/ForgotPassword"));
export const ResetPassword = lazyPage(() => import("@/pages/ResetPassword"));
export const CompleteProfile = lazyPage(() => import("@/pages/CompleteProfile"));
export const NotFound = lazyPage(() => import("@/pages/NotFound"));

// Portal chrome (sheet, avatar, notifications bell) is only ever seen after
// login, so keep it off the public critical path even though both are route
// elements.
export const AdminLayout = lazyPage(() => import("@/components/AdminLayout"));
export const StudentLayout = lazyPage(() => import("@/components/StudentLayout"));

// Student portal
export const StudentDashboard = lazyPage(() => import("@/pages/StudentDashboard"));
export const StudentCourses = lazyPage(() => import("@/pages/StudentCourses"));
export const StudentAttendance = lazyPage(() => import("@/pages/StudentAttendance"));
export const StudentProfile = lazyPage(() => import("@/pages/student/Profile"));
export const StudentMaterials = lazyPage(() => import("@/pages/StudentMaterials"));
export const StudentFees = lazyPage(() => import("@/pages/StudentFees"));
export const Coursemates = lazyPage(() => import("@/pages/student/Coursemates"));
export const StudentAssignments = lazyPage(() => import("@/pages/student/Assignments"));
export const StudentGrades = lazyPage(() => import("@/pages/student/Grades"));
export const StudentAnnouncements = lazyPage(() => import("@/pages/student/Announcements"));
export const StudentCalendar = lazyPage(() => import("@/pages/student/Calendar"));
export const Graduates = lazyPage(() => import("@/pages/student/Graduates"));
export const StudentTranscript = lazyPage(() => import("@/pages/student/Transcript"));
export const StudentCertificate = lazyPage(() => import("@/pages/student/Certificate"));
export const StudentExamsList = lazyPage(() => import("@/pages/student/exams/ExamsList"));
export const StudentExamLobby = lazyPage(() => import("@/pages/student/exams/ExamLobby"));
export const StudentExamRunner = lazyPage(() => import("@/pages/student/exams/ExamRunner"));

// Admin portal
export const AdminDashboard = lazyPage(() => import("@/pages/AdminDashboard"));
export const AdminProfile = lazyPage(() => import("@/pages/admin/Profile"));
export const AdminStudentProfile = lazyPage(() => import("@/pages/admin/StudentProfile"));
export const AdminPayments = lazyPage(() => import("@/pages/admin/Payments"));
export const AdminStudents = lazyPage(() => import("@/pages/AdminStudents"));
export const AdminAdmissions = lazyPage(() => import("@/pages/AdminAdmissions"));
export const AdminSettings = lazyPage(() => import("@/pages/AdminSettings"));
export const AdminAttendance = lazyPage(() => import("@/pages/AdminAttendance"));
export const AdminMaterials = lazyPage(() => import("@/pages/admin/Materials"));
export const AdminAssignments = lazyPage(() => import("@/pages/admin/Assignments"));
export const AdminAnalytics = lazyPage(() => import("@/pages/admin/Analytics"));
export const AdminFees = lazyPage(() => import("@/pages/admin/Fees"));
export const AdminCourses = lazyPage(() => import("@/pages/admin/Courses"));
export const AdminAuditLog = lazyPage(() => import("@/pages/admin/AuditLog"));
export const AdminEmailHistory = lazyPage(() => import("@/pages/admin/EmailHistory"));
export const AdminApprove = lazyPage(() => import("@/pages/AdminApprove"));
export const AdminAnnouncements = lazyPage(() => import("@/pages/admin/Announcements"));
export const AdminCalendar = lazyPage(() => import("@/pages/admin/Calendar"));
export const AdminExamsList = lazyPage(() => import("@/pages/admin/exams/ExamsList"));
export const AdminExamBuilder = lazyPage(() => import("@/pages/admin/exams/ExamBuilder"));
export const AdminExamMonitor = lazyPage(() => import("@/pages/admin/exams/ExamMonitor"));
export const AdminQuestionBank = lazyPage(() => import("@/pages/admin/exams/QuestionBank"));
export const AdminStorage = lazyPage(() => import("@/pages/admin/StorageManagement"));
export const ComingSoon = lazyPage(() => import("@/pages/ComingSoon"));
export const AdminComingSoon = lazyPage(() => import("@/pages/AdminComingSoon"));

/** Nav path → the page that renders it, for hover / idle prefetching. */
const PAGE_BY_PATH: Record<string, LazyPage> = {
  "/about": About,
  "/courses": Courses,
  "/faculty": Faculty,
  "/contact": Contact,
  "/login": Login,
  "/register": Register,
  "/student/dashboard": StudentDashboard,
  "/student/courses": StudentCourses,
  "/student/attendance": StudentAttendance,
  "/student/profile": StudentProfile,
  "/student/materials": StudentMaterials,
  "/student/fees": StudentFees,
  "/student/coursemates": Coursemates,
  "/student/assignments": StudentAssignments,
  "/student/grades": StudentGrades,
  "/student/announcements": StudentAnnouncements,
  "/student/calendar": StudentCalendar,
  "/student/graduates": Graduates,
  "/student/transcript": StudentTranscript,
  "/student/certificate": StudentCertificate,
  "/student/exams": StudentExamsList,
  "/admin": AdminDashboard,
  "/admin/dashboard": AdminDashboard,
  "/admin/profile": AdminProfile,
  "/admin/students": AdminStudents,
  "/admin/admissions": AdminAdmissions,
  "/admin/courses": AdminCourses,
  "/admin/attendance": AdminAttendance,
  "/admin/assignments": AdminAssignments,
  "/admin/exams": AdminExamsList,
  "/admin/materials": AdminMaterials,
  "/admin/fees": AdminFees,
  "/admin/payments": AdminPayments,
  "/admin/announcements": AdminAnnouncements,
  "/admin/calendar": AdminCalendar,
  "/admin/analytics": AdminAnalytics,
  "/admin/storage": AdminStorage,
  "/admin/settings": AdminSettings,
  "/admin/audit": AdminAuditLog,
  "/admin/email-history": AdminEmailHistory,
};

export const preloadPath = (path: string): void => {
  void PAGE_BY_PATH[path]?.preload();
};

/**
 * Warm the chunks for a portal's nav once the browser is idle, so the first
 * click on each menu item doesn't wait on a network round trip.
 */
export const preloadPortal = (prefix: "/student" | "/admin"): void => {
  const conn = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  // Respect data saver / 2g-3g: those users get hover prefetching only.
  if (conn?.saveData || (conn?.effectiveType && !conn.effectiveType.includes("4g"))) return;

  const run = () => {
    for (const [path, page] of Object.entries(PAGE_BY_PATH)) {
      if (path.startsWith(prefix)) void page.preload();
    }
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (idle) idle(run);
  else window.setTimeout(run, 2000);
};
