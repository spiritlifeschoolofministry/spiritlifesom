import { useEffect, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import PublicLayout from "./components/PublicLayout";
import { SessionManagerProvider } from "./components/SessionManagerProvider";
import { MaintenanceGate } from "./components/MaintenanceGate";
import ScrollToTop from "./components/ScrollToTop";
import DomainRedirect from "./components/DomainRedirect";
import { App as CapApp } from "@capacitor/app";

// Home is the landing page, so it stays eager — everything else is lazy.
import Home from "./pages/Home";
import { InstallPWA } from "./components/InstallPWA";

// Public + portal pages — lazy, declared in one place so nav links can prefetch them
import {
  AdminLayout,
  StudentLayout,
  About,
  Courses,
  Faculty,
  Contact,
  Register,
  Login,
  ForgotPassword,
  ResetPassword,
  CompleteProfile,
  NotFound,
  StudentDashboard,
  StudentCourses,
  StudentAttendance,
  StudentProfile,
  StudentMaterials,
  StudentFees,
  Coursemates,
  StudentAssignments,
  StudentGrades,
  StudentAnnouncements,
  StudentCalendar,
  Graduates,
  StudentTranscript,
  StudentCertificate,
  StudentExamsList,
  StudentExamLobby,
  StudentExamRunner,
  AdminDashboard,
  AdminProfile,
  AdminStudentProfile,
  AdminPayments,
  AdminStudents,
  AdminAdmissions,
  AdminSettings,
  AdminAttendance,
  AdminMaterials,
  AdminAssignments,
  AdminAnalytics,
  AdminFees,
  AdminCourses,
  AdminAuditLog,
  AdminEmailHistory,
  AdminApprove,
  AdminAnnouncements,
  AdminCalendar,
  AdminExamsList,
  AdminExamBuilder,
  AdminExamMonitor,
  AdminQuestionBank,
  AdminStorage,
} from "@/routes/lazy-pages";

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
        {/* v7_startTransition: route changes run as transitions, so React keeps
            the current screen on-screen while the next page's lazy chunk loads
            instead of unmounting everything to show the Suspense fallback. */}
        <BrowserRouter future={{ v7_startTransition: true }}>
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

          {/* Profile completion (required after Google/OAuth signup) */}
          <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfile /></ProtectedRoute>} />

          {/* Student portal — the shell is a layout route, so navigating between
              pages swaps only the content area and leaves the sidebar mounted. */}
          <Route element={<ProtectedRoute><StudentLayout /></ProtectedRoute>}>
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/student/profile" element={<StudentProfile />} />
            <Route path="/student/courses" element={<StudentCourses />} />
            <Route path="/student/attendance" element={<StudentAttendance />} />
            <Route path="/student/assignments" element={<StudentAssignments />} />
            <Route path="/student/grades" element={<StudentGrades />} />
            <Route path="/student/materials" element={<StudentMaterials />} />
            <Route path="/student/coursemates" element={<Coursemates />} />
            <Route path="/student/fees" element={<StudentFees />} />
            <Route path="/student/announcements" element={<StudentAnnouncements />} />
            <Route path="/student/calendar" element={<StudentCalendar />} />
            <Route path="/student/graduates" element={<Graduates />} />
            <Route path="/student/transcript" element={<StudentTranscript />} />
            <Route path="/student/certificate" element={<StudentCertificate />} />
            <Route path="/student/exams" element={<StudentExamsList />} />
            <Route path="/student/exams/:id/lobby" element={<StudentExamLobby />} />
          </Route>

          {/* The exam runner is deliberately outside the shell — it takes over
              the screen while an attempt is in progress. */}
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
            <Route path="/admin/audit" element={<ProtectedRoute requiredRole="superadmin"><AdminAuditLog /></ProtectedRoute>} />
            <Route path="/admin/email-history" element={<ProtectedRoute requiredRole="superadmin"><AdminEmailHistory /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute requiredRole="superadmin"><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/storage" element={<ProtectedRoute requiredRole="superadmin"><AdminStorage /></ProtectedRoute>} />
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
