import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import PublicLayout from "./components/PublicLayout";
import AdminLayout from "./components/AdminLayout";
import Home from "./pages/Home";
import About from "./pages/About";
import Courses from "./pages/Courses";
import Faculty from "./pages/Faculty";
import Contact from "./pages/Contact";
import Register from "./pages/Register";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import StudentProfile from "./pages/student/Profile";
import ComingSoon from "./pages/ComingSoon";
import AdminComingSoon from "./pages/AdminComingSoon";
import AdminDashboard from "./pages/AdminDashboard";
import AdminProfile from "./pages/admin/Profile";
import AdminStudents from "./pages/AdminStudents";
import AdminAdmissions from "./pages/AdminAdmissions";
import AdminSettings from "./pages/AdminSettings";
import AdminApprove from "./pages/AdminApprove";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
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
          <Route path="/student/courses" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
          <Route path="/student/attendance" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
          <Route path="/student/assignments" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
          <Route path="/student/materials" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
          <Route path="/student/coursemates" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
          <Route path="/student/fees" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />

          {/* Admin portal */}
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/profile" element={<ProtectedRoute requiredRole="admin"><AdminProfile /></ProtectedRoute>} />
            <Route path="/admin/students" element={<ProtectedRoute requiredRole="admin"><AdminStudents /></ProtectedRoute>} />
            <Route path="/admin/admissions" element={<ProtectedRoute requiredRole="admin"><AdminAdmissions /></ProtectedRoute>} />
            <Route path="/admin/attendance" element={<ProtectedRoute requiredRole="admin"><AdminComingSoon title="Attendance Management" description="Mark student attendance, view reports" icon="calendar" /></ProtectedRoute>} />
            <Route path="/admin/assignments" element={<ProtectedRoute requiredRole="admin"><AdminComingSoon title="Assignment Management" description="Create assignments, review submissions" icon="file-text" /></ProtectedRoute>} />
            <Route path="/admin/materials" element={<ProtectedRoute requiredRole="admin"><AdminComingSoon title="Course Materials" description="Upload materials, manage resources" icon="folder" /></ProtectedRoute>} />
            <Route path="/admin/fees" element={<ProtectedRoute requiredRole="admin"><AdminComingSoon title="Payment Tracking" description="Track fees, record payments" icon="credit-card" /></ProtectedRoute>} />
            <Route path="/admin/announcements" element={<ProtectedRoute requiredRole="admin"><AdminComingSoon title="Announcements" description="Send notifications to students" icon="bell" /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute requiredRole="admin"><AdminSettings /></ProtectedRoute>} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="/admin/approve" element={<AdminApprove />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
