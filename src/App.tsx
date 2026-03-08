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
import Home from "./pages/Home";
import About from "./pages/About";
import Courses from "./pages/Courses";
import Faculty from "./pages/Faculty";
import Contact from "./pages/Contact";
import Register from "./pages/Register";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import StudentCourses from "./pages/StudentCourses";
import StudentAttendance from "./pages/StudentAttendance";
import StudentProfile from "./pages/student/Profile";
import StudentMaterials from "./pages/StudentMaterials";
import StudentFees from "./pages/StudentFees";
import Coursemates from "./pages/student/Coursemates";
import StudentAssignments from "./pages/student/Assignments";
import StudentGrades from "./pages/student/Grades";
import ComingSoon from "./pages/ComingSoon";
import AdminComingSoon from "./pages/AdminComingSoon";
import AdminAnnouncements from "./pages/admin/Announcements";
import StudentAnnouncements from "./pages/student/Announcements";
import AdminCalendar from "./pages/admin/Calendar";
import StudentCalendar from "./pages/student/Calendar";
import Graduates from "./pages/student/Graduates";
import AdminDashboard from "./pages/AdminDashboard";
import AdminProfile from "./pages/admin/Profile";
import AdminPayments from "./pages/admin/Payments";
import AdminStudents from "./pages/AdminStudents";
import AdminAdmissions from "./pages/AdminAdmissions";
import AdminSettings from "./pages/AdminSettings";
import AdminAttendance from "./pages/AdminAttendance";
import AdminMaterials from "./pages/admin/Materials";
import AdminAssignments from "./pages/admin/Assignments";
import AdminFees from "./pages/admin/Fees";
import AdminCourses from "./pages/admin/Courses";
import AdminApprove from "./pages/AdminApprove";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SessionManagerProvider>
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

          {/* Admin portal */}
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/profile" element={<ProtectedRoute requiredRole="admin"><AdminProfile /></ProtectedRoute>} />
            <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><AdminStudents /></ProtectedRoute>} />
            <Route path="/admin/admissions" element={<ProtectedRoute requiredRole="admin"><AdminAdmissions /></ProtectedRoute>} />
            <Route path="/admin/attendance" element={<ProtectedRoute requiredRole="admin"><AdminAttendance /></ProtectedRoute>} />
            <Route path="/admin/courses" element={<ProtectedRoute requiredRole="admin"><AdminCourses /></ProtectedRoute>} />
            <Route path="/admin/assignments" element={<ProtectedRoute requiredRole="admin"><AdminAssignments /></ProtectedRoute>} />
            <Route path="/admin/materials" element={<ProtectedRoute requiredRole="admin"><AdminMaterials /></ProtectedRoute>} />
            <Route path="/admin/fees" element={<ProtectedRoute requiredRole="admin"><AdminFees /></ProtectedRoute>} />
            <Route path="/admin/payments" element={<ProtectedRoute requiredRole="admin"><AdminPayments /></ProtectedRoute>} />
            <Route path="/admin/announcements" element={<ProtectedRoute requiredRole="admin"><AdminAnnouncements /></ProtectedRoute>} />
            <Route path="/admin/calendar" element={<ProtectedRoute requiredRole="admin"><AdminCalendar /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminSettings /></ProtectedRoute>} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="/admin/approve" element={<AdminApprove />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
          </SessionManagerProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;
