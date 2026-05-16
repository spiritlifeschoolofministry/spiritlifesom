import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Check, X, Eye, Search, Users, Clock, Loader2, UserCheck, Mail, Filter, FileJson, CheckCircle2, XCircle, MailCheck, BookOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Application {
  id: string;
  admission_status: string | null;
  created_at: string | null;
  learning_mode: string | null;
  is_born_again: boolean | null;
  has_discovered_ministry: boolean | null;
  gender: string | null;
  age: number | null;
  address: string | null;
  educational_background: string | null;
  preferred_language: string | null;
  ministry_description: string | null;
  marital_status: string | null;
  cohort_id: string | null;
  profile: {
    first_name: string;
    last_name: string;
    middle_name: string | null;
    email: string;
    phone: string | null;
  };
}

interface CohortOption {
  id: string;
  name: string;
}

const AdminAdmissions = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [learningModeRequests, setLearningModeRequests] = useState<any[]>([]);
  const [certificateRequests, setCertificateRequests] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<string>("all");
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [emailStatusByStudent, setEmailStatusByStudent] = useState<
    Record<string, { status: string; sent_at: string | null }>
  >({});
  const [previewApp, setPreviewApp] = useState<Application | null>(null);
  // Client-side throttle: minimum 1.5s between sends
  const lastSendAtRef = useState<{ t: number }>({ t: 0 })[0];

  const resendEmail = async (
    studentId: string,
    emailType: "welcome" | "admission_approved" | "admission_rejected",
    label: string
  ) => {
    // Throttle (rate-limit guard)
    const now = Date.now();
    const elapsed = now - lastSendAtRef.t;
    const MIN_GAP = 1500;
    if (elapsed < MIN_GAP) {
      const wait = Math.ceil((MIN_GAP - elapsed) / 1000);
      toast.warning(`Please wait ${wait}s before sending another email (rate-limit guard).`);
      return;
    }
    lastSendAtRef.t = now;

    // Idempotency key — same student+type within 30s is treated as duplicate click
    const idempotencyKey = `resend:${studentId}:${emailType}:${Math.floor(Date.now() / 30000)}`;

    setResendingId(studentId);
    const toastId = toast.loading(`Sending ${label}…`);
    try {
      const { data, error } = await supabase.functions.invoke("resend-student-email", {
        body: { student_id: studentId, email_type: emailType, idempotency_key: idempotencyKey },
      });
      if (error) throw error;
      const payload = (data as { error?: string; sent_to?: string; attempts?: number }) || {};
      if (payload.error) throw new Error(payload.error);
      const recipient = payload.sent_to || "student";
      const attemptsNote = payload.attempts && payload.attempts > 1 ? ` (after ${payload.attempts} attempts)` : "";
      toast.success(`✉ ${label} sent to ${recipient}${attemptsNote}`, { id: toastId });

      // Audit log: manual email trigger
      try {
        await supabase.rpc("log_manual_admission_email", {
          p_student_id: studentId,
          p_email_type: emailType,
          p_recipient_email: recipient,
        });
      } catch (auditErr) {
        // Non-fatal — log to console only
        console.error("audit log (manual email) failed:", auditErr);
      }

      // Refresh badge if this was an admission email
      if (emailType === "admission_approved" || emailType === "admission_rejected") {
        loadEmailStatuses();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send email";
      toast.error(`Failed to send ${label}: ${msg}`, { id: toastId });
    } finally {
      setResendingId(null);
    }
  };

  // Automatic approval email is handled by the Make.com webhook fired from the
  // `notify_admission_status_change` DB trigger when admission_status changes.
  // Each webhook call is logged to email_send_history (trigger_source = 'automatic',
  // metadata.channel = 'make_webhook') and visible in Admin → Email History.
  const sendAutomaticApprovalEmail = async (_studentId: string) => {
    // no-op
  };

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<
    | { type: "approve"; student: Application }
    | { type: "reject"; student: Application }
    | { type: "bulkApprove" }
    | null
  >(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadApplications();
    loadEmailStatuses();
  }, []);

  // Fetch the latest admission_approved/rejected email status per student
  const loadEmailStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from("email_send_history")
        .select("student_id, email_type, status, created_at")
        .in("email_type", ["admission_approved", "admission_rejected"])
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map: Record<string, { status: string; sent_at: string | null }> = {};
      (data || []).forEach((row: any) => {
        if (row.student_id && !map[row.student_id]) {
          map[row.student_id] = { status: row.status, sent_at: row.created_at };
        }
      });
      setEmailStatusByStudent(map);
    } catch (err) {
      console.error("loadEmailStatuses error:", err);
    }
  };

  const loadApplications = async () => {
    try {
      const [appsRes, cohortsRes, lmRes, certRes] = await Promise.all([
        supabase
          .from("students")
          .select(`
            id,
            admission_status,
            created_at,
            learning_mode,
            is_born_again,
            has_discovered_ministry,
            gender,
            age,
            address,
            educational_background,
            preferred_language,
            ministry_description,
            marital_status,
            cohort_id,
            profile:profiles(first_name, last_name, middle_name, email, phone)
          `)
          .in("admission_status", ["Pending", "PENDING"])
          .order("created_at", { ascending: false }),
        supabase.from("cohorts").select("id, name").order("name"),
        supabase
          .from("students")
          .select("id, learning_mode, requested_learning_mode, profile:profiles(first_name, last_name, middle_name, email, phone, avatar_url), created_at")
          .not("requested_learning_mode", "is", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("students")
          .select("id, pending_name_change, profile:profiles(first_name, last_name, middle_name, email, phone, avatar_url), created_at")
          .not("pending_name_change", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      if (appsRes.error) throw appsRes.error;
      setApplications((appsRes.data as any) || []);
      if (cohortsRes.data) setCohorts(cohortsRes.data as CohortOption[]);
      if (lmRes && (lmRes as any).data) setLearningModeRequests((lmRes as any).data || []);
      if (certRes && (certRes as any).data) setCertificateRequests((certRes as any).data || []);
    } catch (err) {
      console.error("Load applications error:", err);
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleLearningModeRequest = async (studentId: string, action: "approve" | "reject") => {
    try {
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("profile_id, learning_mode, requested_learning_mode")
        .eq("id", studentId)
        .single();

      if (studentError || !studentData) throw studentError || new Error("Could not load student request");

      const updatePayload: any = { requested_learning_mode: null };
      if (action === "approve") updatePayload.learning_mode = studentData.requested_learning_mode || null;

      const { data, error } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("id", studentId)
        .select("profile_id, learning_mode, requested_learning_mode");

      if (error) throw error;

      if (data && data.length > 0 && data[0].profile_id) {
        const notificationTitle = action === "approve" ? "Learning mode change approved" : "Learning mode change denied";
        const notificationBody = action === "approve" ? `Your learning mode has been updated to ${data[0].learning_mode}.` : "Your learning mode change request was rejected by an administrator.";
        await supabase.from("notifications").insert({
          user_id: data[0].profile_id,
          title: notificationTitle,
          body: notificationBody,
          type: "learning_mode_request",
          link: "/student/profile",
        });
      }

      toast.success(action === "approve" ? "Learning mode request approved" : "Learning mode request rejected");
      await loadApplications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process request";
      console.error("Learning mode request error:", err);
      toast.error(msg);
    }
  };

  const handleCertificateRequest = async (studentId: string, action: "approve" | "reject") => {
    try {
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("profile_id, name_on_certificate, pending_name_change")
        .eq("id", studentId)
        .single();

      if (studentError || !studentData) throw studentError || new Error("Could not load certificate request");

      const updatePayload: any = { pending_name_change: null };
      if (action === "approve") updatePayload.name_on_certificate = studentData.pending_name_change || null;

      const { data, error } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("id", studentId)
        .select("profile_id, name_on_certificate, pending_name_change");

      if (error) throw error;

      if (data && data.length > 0 && data[0].profile_id) {
        const notificationTitle = action === "approve" ? "Certificate name change approved" : "Certificate name change denied";
        const notificationBody = action === "approve" ? `Your certificate name has been updated to ${data[0].name_on_certificate}.` : "Your certificate name change request was rejected by an administrator.";
        await supabase.from("notifications").insert({
          user_id: data[0].profile_id,
          title: notificationTitle,
          body: notificationBody,
          type: "certificate_name_change",
          link: "/student/certificate",
        });
      }

      toast.success(action === "approve" ? "Certificate request approved" : "Certificate request rejected");
      await loadApplications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process certificate request";
      console.error("Certificate request error:", err);
      toast.error(msg);
    }
  };

  const handleApprove = async (studentId: string) => {
    try {
      setActionLoading(true);
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "ADMITTED", is_approved: true })
        .eq("id", studentId);

      if (error) throw error;
      toast.success("Student Admitted Successfully");
      // Fire-and-forget automatic admission approval email
      sendAutomaticApprovalEmail(studentId);
      await loadApplications();
      // Webhook fires from DB trigger; refresh email statuses after a short delay
      setTimeout(loadEmailStatuses, 1500);
      setSelectedApp(null);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
      setConfirmAction(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve application";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (studentId: string) => {
    try {
      setActionLoading(true);
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "REJECTED", is_approved: false })
        .eq("id", studentId);

      if (error) throw error;
      toast.success("Application rejected");
      await loadApplications();
      setTimeout(loadEmailStatuses, 1500);
      setSelectedApp(null);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
      setConfirmAction(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject application";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBulkApproving(true);
    setActionLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "ADMITTED", is_approved: true })
        .in("id", ids);

      if (error) throw error;
      toast.success(`${ids.length} student(s) admitted successfully`);
      // Fire-and-forget automatic approval emails for each
      ids.forEach((id, i) => setTimeout(() => sendAutomaticApprovalEmail(id), i * 1600));
      setSelectedIds(new Set());
      await loadApplications();
      setTimeout(loadEmailStatuses, 1500);
      setConfirmAction(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve students";
      toast.error(msg);
    } finally {
      setBulkApproving(false);
      setActionLoading(false);
    }
  };

  const runConfirmedAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "approve") handleApprove(confirmAction.student.id);
    else if (confirmAction.type === "reject") handleReject(confirmAction.student.id);
    else if (confirmAction.type === "bulkApprove") handleBulkApprove();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    const filtered = filteredApplications;
    selectedIds.size === filtered.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(filtered.map((a) => a.id)));
  };

  const filteredApplications = applications.filter((app) => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesQ =
        app.profile.first_name.toLowerCase().includes(q) ||
        app.profile.last_name.toLowerCase().includes(q) ||
        app.profile.email.toLowerCase().includes(q);
      if (!matchesQ) return false;
    }
    // Learning mode
    if (filterMode !== "all") {
      const mode = (app.learning_mode || "").toLowerCase();
      if (mode !== filterMode.toLowerCase()) return false;
    }
    // Cohort
    if (filterCohort !== "all") {
      if ((app.cohort_id || "") !== filterCohort) return false;
    }
    // Preferred language
    if (filterLanguage !== "all") {
      const lang = (app.preferred_language || "").trim().toLowerCase();
      if (filterLanguage === "__none__") {
        if (lang) return false;
      } else if (lang !== filterLanguage.toLowerCase()) {
        return false;
      }
    }
    // Date range (created_at)
    if (filterFrom && app.created_at) {
      if (new Date(app.created_at) < new Date(filterFrom + "T00:00:00")) return false;
    }
    if (filterTo && app.created_at) {
      if (new Date(app.created_at) > new Date(filterTo + "T23:59:59")) return false;
    }
    return true;
  });

  const STATIC_LANGUAGES = ["English", "French", "Yoruba", "Igbo", "Hausa", "Other"];
  const languageOptions = Array.from(
    new Set([
      ...STATIC_LANGUAGES,
      ...applications
        .map((a) => (a.preferred_language || "").trim())
        .filter((v) => v.length > 0),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const hasUnspecifiedLanguage = applications.some((a) => !(a.preferred_language || "").trim());

  const activeFilterCount =
    (filterMode !== "all" ? 1 : 0) +
    (filterCohort !== "all" ? 1 : 0) +
    (filterLanguage !== "all" ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0);

  const clearFilters = () => {
    setFilterMode("all");
    setFilterCohort("all");
    setFilterLanguage("all");
    setFilterFrom("");
    setFilterTo("");
  };

  const getFullName = (app: Application) => {
    return [app.profile.first_name, app.profile.middle_name, app.profile.last_name].filter(Boolean).join(" ");
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Admissions/Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">Review and process new applications and learning-mode requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-foreground">{applications.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/5">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Showing</p>
              <p className="text-2xl font-bold text-foreground">{filteredApplications.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="text-2xl font-bold text-foreground">{selectedIds.size}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <span className="text-sm font-medium text-foreground mr-1">{selectedIds.size} selected</span>
          <Button
            size="sm"
            onClick={() => setConfirmAction({ type: "bulkApprove" })}
            disabled={bulkApproving}
            className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700"
          >
            {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {bulkApproving ? "Approving..." : "Approve All Selected"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-xs h-8 ml-auto text-muted-foreground">
            Clear
          </Button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block">Mode</label>
            <Select value={filterMode} onValueChange={setFilterMode}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="physical">Physical</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block">Cohort</label>
            <Select value={filterCohort} onValueChange={setFilterCohort}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cohorts</SelectItem>
                {cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block">Language</label>
            <Select value={filterLanguage} onValueChange={setFilterLanguage}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {languageOptions.map((lang) => (
                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                ))}
                {hasUnspecifiedLanguage && (
                  <SelectItem value="__none__">Not specified</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block">From</label>
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block">To</label>
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 w-[140px] text-xs" />
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1">
              <X className="w-3.5 h-3.5" /> Clear ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* Applications list */}
      {certificateRequests.length > 0 && (
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Certificate Name Change Requests ({certificateRequests.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {certificateRequests.map((s) => (
              <div key={s.id} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors bg-card`}> 
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{s.profile?.first_name || 'Unknown'} {s.profile?.last_name || 'User'}</h3>
                    <p className="text-sm text-muted-foreground">Requested name: <span className="font-medium">{s.pending_name_change}</span></p>
                    {s.created_at && <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(s.created_at)}</p>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-primary-foreground" onClick={() => handleCertificateRequest(s.id, 'approve')}>
                    <Check className="w-4 h-4" /> Approve
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleCertificateRequest(s.id, 'reject')}>
                    <X className="w-4 h-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {learningModeRequests.length > 0 && (
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-sky-600" /> Learning Mode Change Requests ({learningModeRequests.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {learningModeRequests.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.profile?.first_name || 'Unknown'} {s.profile?.last_name || 'User'}</p>
                  <p className="text-xs text-muted-foreground">Current: {s.learning_mode || '—'} • Requested: {s.requested_learning_mode}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-emerald-600 hover:bg-emerald-50"
                    onClick={() => handleLearningModeRequest(s.id, 'approve')}
                    title="Approve"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => handleLearningModeRequest(s.id, 'reject')}
                    title="Reject"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pending Applications ({filteredApplications.length})</CardTitle>
          {filteredApplications.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={filteredApplications.length > 0 && selectedIds.size === filteredApplications.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredApplications.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No pending applications</p>
              <p className="text-sm text-muted-foreground mt-1">New registrations will appear here automatically</p>
            </div>
          ) : (
            filteredApplications.map((app) => (
              <div
                key={app.id}
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
                  selectedIds.has(app.id) ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <Checkbox
                    checked={selectedIds.has(app.id)}
                    onCheckedChange={() => toggleSelect(app.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{getFullName(app)}</h3>
                    <p className="text-sm text-muted-foreground">{app.profile.email}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                        <Clock className="w-3 h-3 mr-1" /> Pending
                      </Badge>
                      {app.learning_mode && (
                        <Badge variant="outline" className="text-xs">{app.learning_mode}</Badge>
                      )}
                      {app.is_born_again && (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">Born Again</Badge>
                      )}
                      {app.created_at && (
                        <span className="text-[11px] text-muted-foreground self-center">{timeAgo(app.created_at)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Admission email status column */}
                <div className="flex flex-col items-start sm:items-center gap-0.5 sm:min-w-[150px] sm:px-2 sm:border-l sm:border-border sm:py-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Approval email</span>
                  {(() => {
                    const e = emailStatusByStudent[app.id];
                    if (!e) {
                      return (
                        <>
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            <Mail className="w-3 h-3 mr-1" /> Not sent
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">—</span>
                        </>
                      );
                    }
                    if (e.status === "sent") {
                      return (
                        <>
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Sent
                          </Badge>
                          {e.sent_at && (
                            <span className="text-[10px] text-muted-foreground">{new Date(e.sent_at).toLocaleString()}</span>
                          )}
                        </>
                      );
                    }
                    return (
                      <>
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                          <XCircle className="w-3 h-3 mr-1" /> Failed
                        </Badge>
                        {e.sent_at && (
                          <span className="text-[10px] text-muted-foreground">{new Date(e.sent_at).toLocaleString()}</span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setSelectedApp(app)} className="gap-1">
                    <Eye className="w-4 h-4" /> View
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-primary-foreground"
                    onClick={() => setConfirmAction({ type: "approve", student: app })}
                  >
                    <Check className="w-4 h-4" /> Admit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setConfirmAction({ type: "reject", student: app })}
                  >
                    <X className="w-4 h-4" /> Reject
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={resendingId === app.id}
                        title="Re-send email"
                      >
                        {resendingId === app.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        Email
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Re-send email</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => resendEmail(app.id, "welcome", "Welcome email")}>
                        Welcome / Registration
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => resendEmail(app.id, "admission_approved", "Admission approval email")}>
                        Admission Approved
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => resendEmail(app.id, "admission_rejected", "Admission rejection email")}>
                        Admission Rejected
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setPreviewApp(app)}>
                        <FileJson className="w-4 h-4 mr-2" /> Preview approval email
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>Review the full application information</DialogDescription>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoField label="Full Name" value={getFullName(selectedApp)} />
                <InfoField label="Email" value={selectedApp.profile.email} />
                <InfoField label="Phone" value={selectedApp.profile.phone} />
                <InfoField label="Gender" value={selectedApp.gender} />
                <InfoField label="Age" value={selectedApp.age?.toString()} />
                <InfoField label="Marital Status" value={selectedApp.marital_status} />
                <InfoField label="Learning Mode" value={selectedApp.learning_mode} />
                <InfoField label="Language" value={selectedApp.preferred_language} />
                <InfoField label="Born Again" value={selectedApp.is_born_again ? "Yes" : "No"} />
                <InfoField label="Discovered Ministry" value={selectedApp.has_discovered_ministry ? "Yes" : "No"} />
              </div>
              {selectedApp.address && <InfoField label="Address" value={selectedApp.address} />}
              {selectedApp.educational_background && <InfoField label="Education" value={selectedApp.educational_background} />}
              {selectedApp.ministry_description && <InfoField label="Ministry Description" value={selectedApp.ministry_description} />}
              <div className="flex gap-2 pt-4 border-t border-border">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setConfirmAction({ type: "approve", student: selectedApp })}
                >
                  <Check className="w-4 h-4 mr-2" /> Admit Student
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setConfirmAction({ type: "reject", student: selectedApp })}
                >
                  <X className="w-4 h-4 mr-2" /> Reject Application
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for sensitive actions */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        loading={actionLoading}
        title={
          confirmAction?.type === "approve"
            ? "Admit Student?"
            : confirmAction?.type === "reject"
            ? "Reject Application?"
            : "Admit All Selected?"
        }
        description={
          confirmAction?.type === "approve"
            ? `Mark ${getFullName(confirmAction.student)} as ADMITTED. They will gain full portal access.`
            : confirmAction?.type === "reject"
            ? `Reject ${getFullName(confirmAction.student)}'s application. This will set their status to REJECTED.`
            : `Admit ${selectedIds.size} selected student(s) at once.`
        }
        confirmLabel={
          confirmAction?.type === "reject" ? "Reject" : "Admit"
        }
        variant={confirmAction?.type === "reject" ? "destructive" : "default"}
        onConfirm={runConfirmedAction}
      />

      {/* Email Preview Dialog — shows the JSON payload that will be sent to Make.com */}
      <Dialog open={!!previewApp} onOpenChange={(open) => { if (!open) setPreviewApp(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailCheck className="w-5 h-5 text-primary" /> Approval Email Preview
            </DialogTitle>
            <DialogDescription>
              Approval emails are composed and sent by the Make.com scenario. This is the exact webhook payload that will be POSTed when the student is admitted — Make.com uses these fields to build the email (including the WhatsApp join link).
            </DialogDescription>
          </DialogHeader>
          {previewApp && (() => {
            const cohortName = cohorts.find((c) => c.id === previewApp.cohort_id)?.name || null;
            const payload = {
              student_id: previewApp.id,
              old_status: previewApp.admission_status,
              new_status: "ADMITTED",
              email: previewApp.profile.email,
              first_name: previewApp.profile.first_name,
              last_name: previewApp.profile.last_name,
              phone: previewApp.profile.phone,
              cohort_id: previewApp.cohort_id,
              cohort_name: cohortName,
              whatsapp_link: "https://chat.whatsapp.com/F2uoXQS5UFs3tfuQslVL5b",
              changed_at: "<set at trigger time>",
            };
            const json = JSON.stringify(payload, null, 2);
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Recipient:</span> <span className="font-medium">{previewApp.profile.email}</span></div>
                  <div><span className="text-muted-foreground">Webhook:</span> <span className="font-mono text-xs">hook.eu1.make.com/…fy1o</span></div>
                </div>
                <div className="rounded-lg border border-border bg-muted/40">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">POST body</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(json);
                        toast.success("Payload copied");
                      }}
                    >
                      Copy JSON
                    </Button>
                  </div>
                  <pre className="text-xs p-3 overflow-x-auto font-mono whitespace-pre">{json}</pre>
                </div>
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200">
                  <strong>WhatsApp link included:</strong>{" "}
                  <a href="https://chat.whatsapp.com/F2uoXQS5UFs3tfuQslVL5b" target="_blank" rel="noreferrer" className="underline">
                    chat.whatsapp.com/F2uoXQS5UFs3tfuQslVL5b
                  </a>
                  <p className="mt-1 text-amber-800 dark:text-amber-300">Confirm the Make.com email body uses the <code>whatsapp_link</code> field at the end of the message.</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const InfoField = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    <p className="text-sm text-foreground">{value || "N/A"}</p>
  </div>
);

export default AdminAdmissions;
