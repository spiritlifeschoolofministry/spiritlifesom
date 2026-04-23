import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import PublicLayout from "./components/PublicLayout";
import AdminLayout from "./components/AdminLayout";
import { SessionManagerProvider } from "./components/SessionManagerProvider";
import { MaintenanceGate } from "./components/MaintenanceGate";
import ScrollToTop from "./components/ScrollToTop";
import DomainRedirect from "./components/DomainRedirect";
import { App as CapApp } from "@capacitor/app";

// Public pages — eager (small, needed for SEO/first paint)
import Home from "./pages/Home";
import About from "./pages/About";
import Courses from "./pages/Courses";
import Faculty from "./pages/Faculty";
import Contact from "./pages/Contact";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { InstallPWA } from "./components/InstallPWA";

// Student portal — lazy
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const StudentCourses = lazy(() => import("./pages/StudentCourses"));
const StudentAttendance = lazy(() => import("./pages/StudentAttendance"));
const StudentProfile = lazy(() => import("./pages/student/Profile"));
const StudentMaterials = lazy(() => import("./pages/StudentMaterials"));
const StudentFees = lazy(() => import("./pages/StudentFees"));
const Coursemates = lazy(() => import("./pages/student/Coursemates"));
const StudentAssignments = lazy(() => import("./pages/student/Assignments"));
const StudentGrades = lazy(() => import("./pages/student/Grades"));
const StudentAnnouncements = lazy(() => import("./pages/student/Announcements"));
const StudentCalendar = lazy(() => import("./pages/student/Calendar"));
const Graduates = lazy(() => import("./pages/student/Graduates"));
const StudentTranscript = lazy(() => import("./pages/student/Transcript"));
const StudentCertificate = lazy(() => import("./pages/student/Certificate"));
const StudentExamsList = lazy(() => import("./pages/student/exams/ExamsList"));
const StudentExamLobby = lazy(() => import("./pages/student/exams/ExamLobby"));
const StudentExamRunner = lazy(() => import("./pages/student/exams/ExamRunner"));

// Admin portal — lazy
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminProfile = lazy(() => import("./pages/admin/Profile"));
const AdminStudentProfile = lazy(() => import("./pages/admin/StudentProfile"));
const AdminPayments = lazy(() => import("./pages/admin/Payments"));
const AdminStudents = lazy(() => import("./pages/AdminStudents"));
const AdminAdmissions = lazy(() => import("./pages/AdminAdmissions"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminAttendance = lazy(() => import("./pages/AdminAttendance"));
const AdminMaterials = lazy(() => import("./pages/admin/Materials"));
const AdminAssignments = lazy(() => import("./pages/admin/Assignments"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const AdminFees = lazy(() => import("./pages/admin/Fees"));
const AdminCourses = lazy(() => import("./pages/admin/Courses"));
const AdminAuditLog = lazy(() => import("./pages/admin/AuditLog"));
const AdminEmailHistory = lazy(() => import("./pages/admin/EmailHistory"));
const AdminApprove = lazy(() => import("./pages/AdminApprove"));
const AdminAnnouncements = lazy(() => import("./pages/admin/Announcements"));
const AdminCalendar = lazy(() => import("./pages/admin/Calendar"));
const AdminExamsList = lazy(() => import("./pages/admin/exams/ExamsList"));
const AdminExamBuilder = lazy(() => import("./pages/admin/exams/ExamBuilder"));
const AdminExamMonitor = lazy(() => import("./pages/admin/exams/ExamMonitor"));
const AdminQuestionBank = lazy(() => import("./pages/admin/exams/QuestionBank"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const AdminComingSoon = lazy(() => import("./pages/AdminComingSoon"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
  </div>
);

const App = () => {
  useEffect(() => {
    const backHandler = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.exitApp();
      }
    });
    return () => {
      backHandler.then(h => h.remove());
    };
  }, []);

  return (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <InstallPWA />
        <ScrollToTop />
        <DomainRedirect />
        <BrowserRouter>
          <SessionManagerProvider>
          <MaintenanceGate>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public pages with shared nav + footer */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/faculty" element={<Faculty />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>

          {/* Student portal */}
          <Route path="/student/dashboard" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/profile" element={<ProtectedRoute><StudentProfile /></ProtectedRoute>} />
          <Route path="/student/courses" element={<ProtectedRoute><StudentCourses /></ProtectedRoute>} />
          <Route path="/student/attendance" element={<ProtectedRoute><StudentAttendance /></ProtectedRoute>} />
          <Route path="/student/assignments" element={<ProtectedRoute><StudentAssignments /></ProtectedRoute>} />
          <Route path="/student/grades" element={<ProtectedRoute><StudentGrades /></ProtectedRoute>} />
          <Route path="/student/materials" element={<ProtectedRoute><StudentMaterials /></ProtectedRoute>} />
          <Route path="/student/coursemates" element={<ProtectedRoute><Coursemates /></ProtectedRoute>} />
          <Route path="/student/fees" element={<ProtectedRoute><StudentFees /></ProtectedRoute>} />
          <Route path="/student/announcements" element={<ProtectedRoute><StudentAnnouncements /></ProtectedRoute>} />
          <Route path="/student/calendar" element={<ProtectedRoute><StudentCalendar /></ProtectedRoute>} />
          <Route path="/student/graduates" element={<ProtectedRoute><Graduates /></ProtectedRoute>} />
          <Route path="/student/transcript" element={<ProtectedRoute><StudentTranscript /></ProtectedRoute>} />
          <Route path="/student/certificate" element={<ProtectedRoute><StudentCertificate /></ProtectedRoute>} />
          <Route path="/student/exams" element={<ProtectedRoute><StudentExamsList /></ProtectedRoute>} />
          <Route path="/student/exams/:id/lobby" element={<ProtectedRoute><StudentExamLobby /></ProtectedRoute>} />
          <Route path="/student/exams/:id/take" element={<ProtectedRoute><StudentExamRunner /></ProtectedRoute>} />

          {/* Admin portal */}
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/profile" element={<ProtectedRoute requiredRole="admin"><AdminProfile /></ProtectedRoute>} />
            <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><AdminStudents /></ProtectedRoute>} />
            <Route path="/admin/students/:studentId" element={<ProtectedRoute requiredRole="admin"><AdminStudentProfile /></ProtectedRoute>} />
            <Route path="/admin/admissions" element={<ProtectedRoute requiredRole="admin"><AdminAdmissions /></ProtectedRoute>} />
            <Route path="/admin/attendance" element={<ProtectedRoute requiredRole="admin"><AdminAttendance /></ProtectedRoute>} />
            <Route path="/admin/courses" element={<ProtectedRoute requiredRole="admin"><AdminCourses /></ProtectedRoute>} />
            <Route path="/admin/assignments" element={<ProtectedRoute requiredRole="admin"><AdminAssignments /></ProtectedRoute>} />
            <Route path="/admin/materials" element={<ProtectedRoute requiredRole="admin"><AdminMaterials /></ProtectedRoute>} />
            <Route path="/admin/fees" element={<ProtectedRoute requiredRole="admin"><AdminFees /></ProtectedRoute>} />
            <Route path="/admin/payments" element={<ProtectedRoute requiredRole="admin"><AdminPayments /></ProtectedRoute>} />
            <Route path="/admin/announcements" element={<ProtectedRoute requiredRole="admin"><AdminAnnouncements /></ProtectedRoute>} />
            <Route path="/admin/calendar" element={<ProtectedRoute requiredRole="admin"><AdminCalendar /></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="admin"><AdminAnalytics /></ProtectedRoute>} />
            <Route path="/admin/audit" element={<ProtectedRoute requiredRole="admin"><AdminAuditLog /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/exams" element={<ProtectedRoute requiredRole="admin"><AdminExamsList /></ProtectedRoute>} />
            <Route path="/admin/exams/questions" element={<ProtectedRoute requiredRole="admin"><AdminQuestionBank /></ProtectedRoute>} />
            <Route path="/admin/exams/new" element={<ProtectedRoute requiredRole="admin"><AdminExamBuilder /></ProtectedRoute>} />
            <Route path="/admin/exams/:id/edit" element={<ProtectedRoute requiredRole="admin"><AdminExamBuilder /></ProtectedRoute>} />
            <Route path="/admin/exams/:id/monitor" element={<ProtectedRoute requiredRole="admin"><AdminExamMonitor /></ProtectedRoute>} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="/admin/approve" element={<ProtectedRoute requiredRole="admin"><AdminApprove /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
          </MaintenanceGate>
          </SessionManagerProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AuthProvider>
  );
};

export default App;
