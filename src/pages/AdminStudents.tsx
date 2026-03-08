import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, MoreHorizontal, GraduationCap, Loader2, Trash2,
  AlertTriangle, Mail, Send, Users, UserCheck, Clock, XCircle, Eye, ChevronRight, Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Student {
  id: string;
  admission_status: string | null;
  created_at: string | null;
  profile_id?: string;
  cohort_id: string | null;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
  };
  cohort: { name: string } | null;
}

interface CohortOption {
  id: string;
  name: string;
}

const UI_TO_DB_STATUS: Record<string, string> = {
  Pending: "PENDING",
  Approved: "ADMITTED",
  Rejected: "REJECTED",
  Graduate: "Graduate",
};

const DB_TO_UI_STATUS: Record<string, string> = {
  PENDING: "Pending",
  ADMITTED: "Approved",
  REJECTED: "Rejected",
  GRADUATE: "Graduate",
};

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Users; dotColor: string }> = {
  Pending: {
    color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    icon: Clock,
    dotColor: "bg-amber-500",
  },
  Approved: {
    color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
    icon: UserCheck,
    dotColor: "bg-emerald-500",
  },
  Rejected: {
    color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    icon: XCircle,
    dotColor: "bg-red-500",
  },
  Graduate: {
    color: "bg-primary/10 text-primary border-primary/20",
    icon: GraduationCap,
    dotColor: "bg-primary",
  },
};

const AdminStudents = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkGraduateDialog, setShowBulkGraduateDialog] = useState(false);
  const [bulkGraduating, setBulkGraduating] = useState(false);
  const [graduatingId, setGraduatingId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [emailTargets, setEmailTargets] = useState<Student[]>([]);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => { loadStudents(); loadCohorts(); }, []);
  useEffect(() => { filterStudents(); }, [students, searchQuery, statusFilter, cohortFilter]);

  const loadCohorts = async () => {
    const { data } = await supabase.from("cohorts").select("id, name").order("name");
    if (data) setCohorts(data);
  };

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from("students")
        .select(`id, admission_status, created_at, profile_id, cohort_id, profile:profiles(first_name, last_name, email), cohort:cohorts(name)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setStudents((data as any) || []);
    } catch (err) {
      console.error("Load students error:", err);
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const filterStudents = () => {
    let filtered = [...students];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((s) =>
        s.profile.first_name.toLowerCase().includes(q) ||
        s.profile.last_name.toLowerCase().includes(q) ||
        s.profile.email.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((s) => getStatusForUI(s.admission_status) === statusFilter);
    }
    if (cohortFilter !== "all") {
      filtered = filtered.filter((s) => s.cohort_id === cohortFilter);
    }
    setFilteredStudents(filtered);
  };

  const handleStatusChange = async (studentId: string, newStatus: string) => {
    try {
      const dbStatus = UI_TO_DB_STATUS[newStatus] || "PENDING";
      const is_approved = dbStatus === "ADMITTED";
      const { error } = await supabase.from("students").update({ admission_status: dbStatus, is_approved }).eq("id", studentId);
      if (error) { toast.error(error.message); return; }
      setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, admission_status: dbStatus } : s));
      toast.success(`Student marked as ${newStatus}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleGraduateSingle = async (studentId: string) => {
    try {
      setGraduatingId(studentId);
      const { error } = await supabase.from("students").update({ admission_status: "Graduate", is_approved: true }).eq("id", studentId);
      if (error) throw error;
      setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, admission_status: "Graduate" } : s));
      toast.success("Student marked as Graduate 🎓");
    } catch { toast.error("Failed to graduate student"); }
    finally { setGraduatingId(null); }
  };

  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const { id: studentId, profile_id: profileId } = deleteTarget;
      await supabase.from("payments").delete().eq("student_id", studentId);
      await supabase.from("assignment_submissions").delete().eq("student_id", studentId);
      await supabase.from("attendance").delete().eq("student_id", studentId);
      await supabase.from("fees").delete().eq("student_id", studentId);
      const { error } = await supabase.from("students").delete().eq("id", studentId);
      if (error) throw error;
      if (profileId) await supabase.from("profiles").delete().eq("id", profileId);
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
      toast.success(`${deleteTarget.profile.first_name} ${deleteTarget.profile.last_name} has been deleted`);
    } catch (err) {
      console.error("Delete student error:", err);
      toast.error("Failed to delete student.");
    } finally { setDeleting(false); setDeleteTarget(null); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const affected = students.filter((s) => selectedIds.has(s.id));
    const count = ids.length;
    setStudents((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
    setShowBulkDeleteDialog(false);
    setBulkDeleting(false);
    const timeoutId = setTimeout(async () => {
      try {
        const profileIds = affected.filter((s) => s.profile_id).map((s) => s.profile_id as string);
        await supabase.from("payments").delete().in("student_id", ids);
        await supabase.from("assignment_submissions").delete().in("student_id", ids);
        await supabase.from("attendance").delete().in("student_id", ids);
        await supabase.from("fees").delete().in("student_id", ids);
        const { error } = await supabase.from("students").delete().in("id", ids);
        if (error) throw error;
        if (profileIds.length > 0) await supabase.from("profiles").delete().in("id", profileIds);
      } catch { toast.error("Failed to delete students. Refreshing..."); loadStudents(); }
    }, 6000);
    toast(`${count} student(s) deleted`, {
      duration: 5500,
      action: { label: "Undo", onClick: () => { clearTimeout(timeoutId); setStudents((prev) => [...affected, ...prev]); toast.success("Deletion undone"); } },
    });
  };

  const handleBulkGraduate = async () => {
    if (selectedIds.size === 0) return;
    try {
      setBulkGraduating(true);
      const ids = Array.from(selectedIds);
      const prev = new Map(students.filter((s) => selectedIds.has(s.id)).map((s) => [s.id, s.admission_status]));
      const { error } = await supabase.from("students").update({ admission_status: "Graduate", is_approved: true }).in("id", ids);
      if (error) throw error;
      setStudents((p) => p.map((s) => selectedIds.has(s.id) ? { ...s, admission_status: "Graduate" } : s));
      setSelectedIds(new Set());
      setShowBulkGraduateDialog(false);
      toast(`${ids.length} student(s) marked as Graduate 🎓`, {
        duration: 5500,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              for (const [id, st] of prev) await supabase.from("students").update({ admission_status: st || "PENDING", is_approved: st === "ADMITTED" }).eq("id", id);
              setStudents((p) => p.map((s) => prev.has(s.id) ? { ...s, admission_status: prev.get(s.id) || "PENDING" } : s));
              toast.success("Graduation undone");
            } catch { toast.error("Failed to undo."); }
          },
        },
      });
    } catch { toast.error("Failed to graduate students"); }
    finally { setBulkGraduating(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    selectedIds.size === filteredStudents.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
  };

  const openEmailForStudent = (student: Student) => { setEmailTargets([student]); setEmailSubject(""); setEmailBody(""); setShowEmailDialog(true); };
  const openBulkEmail = () => {
    const sel = filteredStudents.filter((s) => selectedIds.has(s.id));
    if (sel.length === 0) { toast.error("No students selected"); return; }
    setEmailTargets(sel); setEmailSubject(""); setEmailBody(""); setShowEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) { toast.error("Subject and body required"); return; }
    try {
      setSendingEmail(true);
      const recipients = emailTargets.map((s) => ({ email: s.profile.email, name: `${s.profile.first_name} ${s.profile.last_name}`.trim() }));
      const { data, error } = await supabase.functions.invoke("send-student-email", { body: { recipients, subject: emailSubject, body: emailBody } });
      if (error) throw error;
      data.failCount > 0 ? toast.warning(`${data.successCount} sent, ${data.failCount} failed`) : toast.success(`Email sent to ${data.successCount} student(s)`);
      setShowEmailDialog(false); setEmailTargets([]);
    } catch (err) { console.error(err); toast.error("Failed to send email."); }
    finally { setSendingEmail(false); }
  };

  const getStatusForUI = (status: string | null) => DB_TO_UI_STATUS[(status || "").toUpperCase()] || "Pending";

  const handleExportCSV = async () => {
    try {
      toast.info("Preparing export...");
      const { data, error } = await supabase
        .from("students")
        .select(`
          id, admission_status, student_code, learning_mode, gender, age, date_of_birth,
          marital_status, address, educational_background, preferred_language,
          is_born_again, has_discovered_ministry, created_at,
          profile:profiles(first_name, middle_name, last_name, email, phone),
          cohort:cohorts(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) { toast.error("No students to export"); return; }

      const rows = (data as any[]).map((s) => ({
        "First Name": s.profile?.first_name || "",
        "Middle Name": s.profile?.middle_name || "",
        "Last Name": s.profile?.last_name || "",
        "Email": s.profile?.email || "",
        "Phone": s.profile?.phone || "",
        "Student Code": s.student_code || "",
        "Status": getStatusForUI(s.admission_status),
        "Cohort": s.cohort?.name || "",
        "Learning Mode": s.learning_mode || "",
        "Gender": s.gender || "",
        "Age": s.age ?? "",
        "Date of Birth": s.date_of_birth || "",
        "Marital Status": s.marital_status || "",
        "Address": s.address || "",
        "Education": s.educational_background || "",
        "Language": s.preferred_language || "",
        "Born Again": s.is_born_again ? "Yes" : "No",
        "Discovered Ministry": s.has_discovered_ministry ? "Yes" : "No",
        "Joined": s.created_at ? new Date(s.created_at).toLocaleDateString() : "",
      }));

      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((h) => {
            const val = String(row[h as keyof typeof row] ?? "");
            return val.includes(",") || val.includes('"') || val.includes("\n")
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          }).join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `students_export_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} students`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export students");
    }
  };

  // Stats
  const totalCount = students.length;
  const pendingCount = students.filter((s) => getStatusForUI(s.admission_status) === "Pending").length;
  const approvedCount = students.filter((s) => getStatusForUI(s.admission_status) === "Approved").length;
  const graduateCount = students.filter((s) => getStatusForUI(s.admission_status) === "Graduate").length;

  const statCards = [
    { label: "Total Students", value: totalCount, icon: Users, color: "text-foreground", bg: "bg-secondary" },
    { label: "Pending", value: pendingCount, icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
    { label: "Approved", value: approvedCount, icon: UserCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "Graduates", value: graduateCount, icon: GraduationCap, color: "text-primary", bg: "bg-primary/5" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Students</h1>
          <p className="text-muted-foreground text-sm">Manage enrollment, status, and communications</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2 self-start">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat) => (
          <Card
            key={stat.label}
            className="shadow-[var(--shadow-card)] border-border cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if (stat.label === "Total Students") setStatusFilter("all");
              else if (stat.label === "Pending") setStatusFilter("Pending");
              else if (stat.label === "Approved") setStatusFilter("Approved");
              else if (stat.label === "Graduates") setStatusFilter("Graduate");
            }}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stat.bg} shrink-0`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className={`text-xl sm:text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium text-foreground mr-1">
            {selectedIds.size} selected
          </span>
          <Button variant="outline" size="sm" onClick={openBulkEmail} className="gap-1.5 text-xs h-8">
            <Mail className="h-3.5 w-3.5" /> Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setShowBulkDeleteDialog(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <Button size="sm" onClick={() => setShowBulkGraduateDialog(true)} className="gap-1.5 text-xs h-8">
            <GraduationCap className="h-3.5 w-3.5" /> Graduate
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-xs h-8 ml-auto text-muted-foreground">
            Clear
          </Button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
            <SelectItem value="Graduate">Graduate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cohortFilter} onValueChange={setCohortFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter by cohort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cohorts</SelectItem>
            {cohorts.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        Showing {filteredStudents.length} of {totalCount} students
        {statusFilter !== "all" && <span> · Status: <span className="font-medium text-foreground">{statusFilter}</span></span>}
        {cohortFilter !== "all" && <span> · Cohort: <span className="font-medium text-foreground">{cohorts.find(c => c.id === cohortFilter)?.name}</span></span>}
      </p>

      {/* Desktop Table */}
      <Card className="shadow-[var(--shadow-card)] border-border hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={filteredStudents.length > 0 && selectedIds.size === filteredStudents.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">No students found</p>
                    <p className="text-xs mt-1">Try adjusting your search or filter</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((student) => {
                  const uiStatus = getStatusForUI(student.admission_status);
                  const cfg = STATUS_CONFIG[uiStatus] || STATUS_CONFIG.Pending;
                  const initials = `${student.profile.first_name?.[0] || ""}${student.profile.last_name?.[0] || ""}`;

                  return (
                    <TableRow
                      key={student.id}
                      className={`cursor-pointer transition-colors ${selectedIds.has(student.id) ? "bg-primary/5" : "hover:bg-muted/50"}`}
                      onClick={() => navigate(`/admin/students/${student.id}`)}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(student.id)}
                          onCheckedChange={() => toggleSelect(student.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">
                              {student.profile.first_name} {student.profile.last_name}
                              {uiStatus === "Graduate" && <GraduationCap className="inline ml-1.5 h-3.5 w-3.5 text-primary" />}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{student.profile.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={uiStatus}
                          onValueChange={(value) => handleStatusChange(student.id, value)}
                        >
                          <SelectTrigger className={`w-32 h-8 text-xs border ${cfg.color}`}>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
                            <SelectItem value="Graduate">Graduate</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {student.created_at ? new Date(student.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </TableCell>
                      <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => navigate(`/admin/students/${student.id}`)}>
                              <Eye className="mr-2 h-4 w-4" /> View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEmailForStudent(student)}>
                              <Mail className="mr-2 h-4 w-4" /> Send Email
                            </DropdownMenuItem>
                            {uiStatus !== "Graduate" && (
                              <DropdownMenuItem onClick={() => handleGraduateSingle(student.id)} disabled={graduatingId === student.id}>
                                <GraduationCap className="mr-2 h-4 w-4" />
                                {graduatingId === student.id ? "Graduating..." : "Graduate"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(student)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2">
        {filteredStudents.length === 0 ? (
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">No students found</p>
              <p className="text-xs mt-1">Try adjusting your search or filter</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={filteredStudents.length > 0 && selectedIds.size === filteredStudents.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
            {filteredStudents.map((student) => {
              const uiStatus = getStatusForUI(student.admission_status);
              const cfg = STATUS_CONFIG[uiStatus] || STATUS_CONFIG.Pending;
              const initials = `${student.profile.first_name?.[0] || ""}${student.profile.last_name?.[0] || ""}`;

              return (
                <Card
                  key={student.id}
                  className={`shadow-[var(--shadow-card)] border-border transition-colors ${selectedIds.has(student.id) ? "border-primary/40 bg-primary/5" : ""}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedIds.has(student.id)}
                        onCheckedChange={() => toggleSelect(student.id)}
                      />
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0" onClick={() => navigate(`/admin/students/${student.id}`)}>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground truncate">
                            {student.profile.first_name} {student.profile.last_name}
                          </p>
                          {uiStatus === "Graduate" && <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{student.profile.email}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${cfg.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${cfg.dotColor}`} />
                            {uiStatus}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {student.created_at ? new Date(student.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => navigate(`/admin/students/${student.id}`)}>
                            <Eye className="mr-2 h-4 w-4" /> View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEmailForStudent(student)}>
                            <Mail className="mr-2 h-4 w-4" /> Send Email
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(student.id, "Approved")}>
                            <UserCheck className="mr-2 h-4 w-4" /> Approve
                          </DropdownMenuItem>
                          {uiStatus !== "Graduate" && (
                            <DropdownMenuItem onClick={() => handleGraduateSingle(student.id)}>
                              <GraduationCap className="mr-2 h-4 w-4" /> Graduate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(student)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>

      {/* Bulk Graduate Dialog */}
      <Dialog open={showBulkGraduateDialog} onOpenChange={setShowBulkGraduateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" /> Confirm Bulk Graduation
            </DialogTitle>
            <DialogDescription>
              Mark <strong>{selectedIds.size}</strong> student(s) as Graduate. This will update their admission status.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto space-y-1 my-2">
            {filteredStudents.filter((s) => selectedIds.has(s.id)).map((s) => (
              <p key={s.id} className="text-sm text-muted-foreground">• {s.profile.first_name} {s.profile.last_name}</p>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowBulkGraduateDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkGraduate} disabled={bulkGraduating} className="gap-2">
              {bulkGraduating ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
              {bulkGraduating ? "Graduating..." : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Delete {selectedIds.size} Student(s)
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected students and all related records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto space-y-1 my-2">
            {filteredStudents.filter((s) => selectedIds.has(s.id)).map((s) => (
              <p key={s.id} className="text-sm text-muted-foreground">• {s.profile.first_name} {s.profile.last_name}</p>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {bulkDeleting ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Delete Student
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to delete <strong>{deleteTarget?.profile.first_name} {deleteTarget?.profile.last_name}</strong>?</p>
              <p className="text-sm text-muted-foreground">This removes all associated data including submissions, attendance, fees, and payments.</p>
              <p className="text-sm font-medium text-destructive mt-2">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStudent} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={(open) => !open && setShowEmailDialog(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {emailTargets.length === 1 ? `Email ${emailTargets[0].profile.first_name}` : `Email ${emailTargets.length} Students`}
            </DialogTitle>
            <DialogDescription>
              {emailTargets.length === 1 ? `To: ${emailTargets[0].profile.email}` : `Sending to ${emailTargets.length} selected students`}
            </DialogDescription>
          </DialogHeader>
          {emailTargets.length > 1 && (
            <div className="max-h-24 overflow-y-auto border border-border rounded-lg p-2 text-xs text-muted-foreground space-y-0.5">
              {emailTargets.map((s) => (
                <p key={s.id}>• {s.profile.first_name} {s.profile.last_name} ({s.profile.email})</p>
              ))}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input id="email-subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject..." className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email-body">Message</Label>
              <Textarea id="email-body" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Write your message here..." rows={6} className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowEmailDialog(false)} disabled={sendingEmail}>Cancel</Button>
            <Button variant="flame" onClick={handleSendEmail} disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()} className="gap-2">
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendingEmail ? "Sending..." : `Send${emailTargets.length > 1 ? ` to ${emailTargets.length}` : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminStudents;
