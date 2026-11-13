import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, Search, Users, Loader2, Mail, Filter, FileJson, CheckCircle2, XCircle, MailCheck, AlertTriangle, ChevronDown, Send } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { cn } from "@/lib/utils";
import { AdminPageHeader, Panel, StatusPill, InitialsBadge } from "@/components/redesign/admin/primitives";
import { queueRowClass, APPROVE_BUTTON, REJECT_BUTTON, QUIET_BUTTON } from "@/components/redesign/admin/styles";

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
    /** Generated column: null = usable, 'ambiguous' or 'unusable'. */
    whatsapp_number_issue: string | null;
  };
}

/** The profile columns both request queries embed. */
interface RequesterProfile {
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
}

interface LearningModeRequest {
  id: string;
  learning_mode: string | null;
  requested_learning_mode: string | null;
  created_at: string | null;
  profile: RequesterProfile | null;
}

interface CertificateNameRequest {
  id: string;
  pending_name_change: string | null;
  created_at: string | null;
  profile: RequesterProfile | null;
}

interface CohortOption {
  id: string;
  name: string;
}

type View = "pending" | "requests" | "admitted" | "rejected";
type DecidedView = "admitted" | "rejected";

/** One select for every application list, pending or decided. */
const APPLICATION_SELECT = `
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
  profile:profiles(first_name, last_name, middle_name, email, phone, whatsapp_number_issue)
`;

const DECIDED_STATUSES: Record<DecidedView, string[]> = {
  admitted: ["ADMITTED", "Admitted"],
  rejected: ["REJECTED", "Rejected"],
};

/** Why a phone number will not work on WhatsApp, in words staff can act on. */
const WHATSAPP_ISSUE: Record<string, string> = {
  ambiguous:
    "The phone field holds more than one number, so WhatsApp messages can't tell which one to use. Message them to ask which number is on WhatsApp.",
  unusable:
    "This phone number can't be read as a WhatsApp number, so WhatsApp messages won't reach them. Email still works; message them to ask for a working number.",
};

const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

const Kbd = ({ children, onDark = false }: { children: string; onDark?: boolean }) => (
  <kbd
    aria-hidden="true"
    className={cn(
      "ml-1 hidden rounded px-1.5 py-px font-sans text-[11px] font-semibold sm:inline",
      onDark ? "bg-white/20" : "bg-muted text-muted-foreground",
    )}
  >
    {children}
  </kbd>
);

const AdminAdmissions = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [learningModeRequests, setLearningModeRequests] = useState<LearningModeRequest[]>([]);
  const [certificateRequests, setCertificateRequests] = useState<CertificateNameRequest[]>([]);
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

  // Admitted / rejected lists load only when their tab is first opened.
  const [decided, setDecided] = useState<Record<DecidedView, Application[] | null>>({
    admitted: null,
    rejected: null,
  });
  const [decidedLoading, setDecidedLoading] = useState(false);

  // Note box in the detail panel, and the message dialog it feeds.
  const [note, setNote] = useState("");
  const [messageTargets, setMessageTargets] = useState<Application[]>([]);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const detailRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<View, HTMLButtonElement | null>>({
    pending: null,
    requests: null,
    admitted: null,
    rejected: null,
  });

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
      (data || []).forEach((row) => {
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
          .select(APPLICATION_SELECT)
          .eq("is_staff_preview", false)
          .in("admission_status", ["Pending", "PENDING"])
          .order("created_at", { ascending: false }),
        supabase.from("cohorts").select("id, name").order("name"),
        supabase
          .from("students")
          .select("id, learning_mode, requested_learning_mode, profile:profiles(first_name, last_name, middle_name, email, phone, avatar_url), created_at")
          .eq("is_staff_preview", false)
          .not("requested_learning_mode", "is", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("students")
          .select("id, pending_name_change, profile:profiles(first_name, last_name, middle_name, email, phone, avatar_url), created_at")
          .eq("is_staff_preview", false)
          .not("pending_name_change", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      if (appsRes.error) throw appsRes.error;
      setApplications((appsRes.data || []) as unknown as Application[]);
      if (cohortsRes.data) setCohorts(cohortsRes.data as CohortOption[]);
      if (lmRes?.data) setLearningModeRequests(lmRes.data || []);
      if (certRes?.data) setCertificateRequests(certRes.data || []);
    } catch (err) {
      console.error("Load applications error:", err);
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const loadDecided = async (kind: DecidedView) => {
    setDecidedLoading(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select(APPLICATION_SELECT)
        .eq("is_staff_preview", false)
        .in("admission_status", DECIDED_STATUSES[kind])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setDecided((prev) => ({ ...prev, [kind]: (data || []) as unknown as Application[] }));
    } catch (err) {
      console.error(`Load ${kind} applications error:`, err);
      toast.error(`Failed to load ${kind} applications`);
      setDecided((prev) => ({ ...prev, [kind]: [] }));
    } finally {
      setDecidedLoading(false);
    }
  };

  useEffect(() => {
    if ((view === "admitted" || view === "rejected") && decided[view] === null && !decidedLoading) {
      loadDecided(view);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, decided]);

  const handleLearningModeRequest = async (studentId: string, action: "approve" | "reject") => {
    try {
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("profile_id, learning_mode, requested_learning_mode")
        .eq("id", studentId)
        .single();

      if (studentError || !studentData) throw studentError || new Error("Could not load student request");

      const updatePayload: TablesUpdate<'students'> = { requested_learning_mode: null };
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

      const updatePayload: TablesUpdate<'students'> = { pending_name_change: null };
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

  /** The one write that admits a student; single and bulk approve both use it. */
  const admitOne = (studentId: string) =>
    supabase
      .from("students")
      .update({ admission_status: "ADMITTED", is_approved: true })
      .eq("id", studentId);

  /** After a decision the next application in the list opens automatically. */
  const nextIdAfter = (studentId: string) => {
    const index = filteredApplications.findIndex((a) => a.id === studentId);
    if (index === -1) return null;
    return (filteredApplications[index + 1] ?? filteredApplications[index - 1])?.id ?? null;
  };

  /** Decided lists are stale after a decision; reload them next time they open. */
  const invalidateDecided = () => setDecided({ admitted: null, rejected: null });

  const handleApprove = async (studentId: string) => {
    try {
      setActionLoading(true);
      const next = nextIdAfter(studentId);
      const { error } = await admitOne(studentId);

      if (error) throw error;
      toast.success("Student Admitted Successfully");
      // Fire-and-forget automatic admission approval email
      sendAutomaticApprovalEmail(studentId);
      await loadApplications();
      invalidateDecided();
      // Webhook fires from DB trigger; refresh email statuses after a short delay
      setTimeout(loadEmailStatuses, 1500);
      setSelectedId(next);
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
      const next = nextIdAfter(studentId);
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "REJECTED", is_approved: false })
        .eq("id", studentId);

      if (error) throw error;
      toast.success("Application rejected");
      await loadApplications();
      invalidateDecided();
      setTimeout(loadEmailStatuses, 1500);
      setSelectedId(next);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
      setConfirmAction(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject application";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk approve walks the selection through the same single-student write, so
  // one failure does not take the rest of the batch down with it.
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBulkApproving(true);
    setActionLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const failed: string[] = [];
      let admitted = 0;
      for (const id of ids) {
        const { error } = await admitOne(id);
        if (error) {
          console.error("Bulk approve failed for", id, error);
          failed.push(id);
        } else {
          // Fire-and-forget automatic approval emails for each
          setTimeout(() => sendAutomaticApprovalEmail(id), admitted * 1600);
          admitted++;
        }
      }
      if (failed.length > 0) {
        toast.warning(`${admitted} student(s) admitted, ${failed.length} failed`);
      } else {
        toast.success(`${admitted} student(s) admitted successfully`);
      }
      // Leave the failures selected so they can be retried.
      setSelectedIds(new Set(failed));
      await loadApplications();
      invalidateDecided();
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

  // ===== Message (email, through the same sender the Students page uses) =====
  const openMessage = (targets: Application[], body = "") => {
    if (targets.length === 0) return;
    setMessageTargets(targets);
    setMessageSubject("");
    setMessageBody(body);
  };

  const handleSendMessage = async () => {
    if (!messageSubject.trim() || !messageBody.trim()) { toast.error("Subject and body required"); return; }
    try {
      setSendingMessage(true);
      // The id travels with the address so the sender can fill this student's
      // own figures into any {{token}} the body carries.
      const recipients = messageTargets.map((a) => ({
        student_id: a.id,
        email: a.profile.email,
        name: `${a.profile.first_name} ${a.profile.last_name}`.trim(),
      }));
      const { data, error } = await supabase.functions.invoke("send-student-email", {
        body: { recipients, subject: messageSubject, body: messageBody },
      });
      if (error) throw error;
      if (data.failCount > 0) toast.warning(`${data.successCount} sent, ${data.failCount} failed`);
      else toast.success(`Email sent to ${data.successCount} applicant(s)`);
      setMessageTargets([]);
      setNote("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to send email.");
    } finally {
      setSendingMessage(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const matchesFilters = (app: Application) => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesQ =
        (app.profile?.first_name || "").toLowerCase().includes(q) ||
        (app.profile?.last_name || "").toLowerCase().includes(q) ||
        (app.profile?.email || "").toLowerCase().includes(q);
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
  };

  const filteredApplications = applications.filter(matchesFilters);

  const sourceList: Application[] =
    view === "pending" ? applications : view === "requests" ? [] : decided[view] ?? [];
  const visibleList: Application[] =
    view === "pending" ? filteredApplications : sourceList.filter(matchesFilters);
  const current: Application | null =
    visibleList.find((a) => a.id === selectedId) ?? visibleList[0] ?? null;

  // Everything ticked in this view, even rows a filter is currently hiding, so
  // the bulk buttons always say exactly how many they will act on.
  const selectedVisible = sourceList.filter((a) => selectedIds.has(a.id));
  const allVisibleSelected = visibleList.length > 0 && visibleList.every((a) => selectedIds.has(a.id));

  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set<string>() : new Set(visibleList.map((a) => a.id)));
  };

  // A fresh applicant gets a fresh note box.
  useEffect(() => {
    setNote("");
  }, [current?.id]);

  const switchView = (next: View) => {
    setView(next);
    setSelectedIds(new Set());
    setSelectedId(null);
  };

  const pickApplicant = (id: string) => {
    setSelectedId(id);
    // On a phone the panel sits under the list, so bring it into view.
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // Keyboard: J/K move, A approve, M message, R reject. Held in a ref so the
  // listener is registered once but always sees the current list.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (confirmAction || previewApp || messageTargets.length > 0) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (view === "requests" || !current) return;
      const key = event.key.toLowerCase();
      const index = visibleList.findIndex((a) => a.id === current.id);
      if (key === "j" || key === "k") {
        const target = visibleList[key === "j" ? index + 1 : index - 1];
        if (target) {
          event.preventDefault();
          setSelectedId(target.id);
        }
      } else if (key === "m") {
        event.preventDefault();
        openMessage([current], note);
      } else if (view === "pending" && key === "a") {
        event.preventDefault();
        setConfirmAction({ type: "approve", student: current });
      } else if (view === "pending" && key === "r") {
        event.preventDefault();
        setConfirmAction({ type: "reject", student: current });
      }
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

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
    return [app.profile?.first_name, app.profile?.middle_name, app.profile?.last_name].filter(Boolean).join(" ") || "Unknown applicant";
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

  const yesNo = (value: boolean | null) => (value === null ? null : value ? "Yes" : "No");

  const requestCount = learningModeRequests.length + certificateRequests.length;

  const TABS: { id: View; label: string }[] = [
    { id: "pending", label: `Pending · ${applications.length}` },
    { id: "requests", label: `Requests · ${requestCount}` },
    { id: "admitted", label: "Admitted" },
    { id: "rejected", label: "Rejected" },
  ];

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const nextIndex = (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    const next = TABS[nextIndex].id;
    switchView(next);
    tabRefs.current[next]?.focus();
  };

  const renderEmailStatus = (app: Application) => {
    const e = emailStatusByStudent[app.id];
    if (!e) {
      return (
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill tone="neutral"><Mail className="mr-1 h-3 w-3" aria-hidden="true" /> Not sent</StatusPill>
        </span>
      );
    }
    return (
      <span className="flex flex-wrap items-center gap-2">
        {e.status === "sent" ? (
          <StatusPill tone="good"><CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" /> Sent</StatusPill>
        ) : (
          <StatusPill tone="bad"><XCircle className="mr-1 h-3 w-3" aria-hidden="true" /> Failed</StatusPill>
        )}
        {e.sent_at && <span className="text-xs text-muted-foreground">{new Date(e.sent_at).toLocaleString()}</span>}
      </span>
    );
  };

  const renderEmailMenu = (app: Application) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-11 gap-1.5 rounded-xl px-4 text-[15px] font-semibold", QUIET_BUTTON)}
          disabled={resendingId === app.id}
        >
          {resendingId === app.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          Re-send email
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
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
  );

  const renderDetail = (app: Application) => {
    const isPending = view === "pending";
    const issue = app.profile?.whatsapp_number_issue;
    const cohortName = cohorts.find((c) => c.id === app.cohort_id)?.name || null;
    const fields: { k: string; v: string | null | undefined }[] = [
      { k: "Learning mode", v: app.learning_mode },
      { k: "Age", v: app.age?.toString() },
      { k: "Gender", v: app.gender },
      { k: "WhatsApp / phone", v: app.profile?.phone },
      { k: "Email", v: app.profile?.email },
      { k: "Born again", v: yesNo(app.is_born_again) },
      { k: "Discovered ministry", v: yesNo(app.has_discovered_ministry) },
      { k: "Marital status", v: app.marital_status },
      { k: "Education", v: app.educational_background },
      { k: "Cohort", v: cohortName },
      { k: "Preferred language", v: app.preferred_language },
    ];
    const firstName = app.profile?.first_name || "the applicant";

    return (
      <section
        ref={detailRef}
        aria-labelledby="applicant-name"
        className="flex min-w-0 scroll-mt-4 flex-col gap-5 rounded-[18px] border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-3.5">
          <InitialsBadge name={getFullName(app)} size="lg" strong />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="applicant-name" className="break-words text-[22px] font-extrabold tracking-tight text-foreground">
              {getFullName(app)}
            </h2>
            <span className="text-sm text-muted-foreground">
              Applied {app.created_at ? new Date(app.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}
              {app.created_at ? ` · ${timeAgo(app.created_at)}` : ""}
            </span>
          </div>
          {view === "admitted" && <StatusPill tone="good">Admitted</StatusPill>}
          {view === "rejected" && <StatusPill tone="bad">Rejected</StatusPill>}
        </div>

        {issue && (
          <div
            role="note"
            className="flex gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <strong className="font-semibold">WhatsApp number issue. </strong>
              {WHATSAPP_ISSUE[issue] ?? "This phone number may not work on WhatsApp. Message them to check."}
            </p>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.k} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.k}</dt>
              <dd className="break-words text-[15px] text-foreground">{f.v || "Not given"}</dd>
            </div>
          ))}
          {app.address && (
            <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</dt>
              <dd className="break-words text-[15px] text-foreground">{app.address}</dd>
            </div>
          )}
          {app.ministry_description && (
            <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ministry description</dt>
              <dd className="whitespace-pre-line break-words text-[15px] text-foreground">{app.ministry_description}</dd>
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision email</dt>
            <dd>{renderEmailStatus(app)}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="applicant-note" className="text-[13px] font-semibold">
            Message to {firstName} (sent by email)
          </Label>
          <Textarea
            id="applicant-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional. Opens in the message window when you press Message."
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            The admission decision email goes out automatically when you approve or reject, and
            cannot carry this note. Use Message to send it as its own email.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {isPending && (
            <Button
              className={cn("h-11 rounded-xl px-5 text-[15px] font-bold", APPROVE_BUTTON)}
              onClick={() => setConfirmAction({ type: "approve", student: app })}
              aria-keyshortcuts="A"
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Approve <Kbd onDark>A</Kbd>
            </Button>
          )}
          <Button
            variant="outline"
            className={cn("h-11 rounded-xl px-4 text-[15px] font-semibold", QUIET_BUTTON)}
            onClick={() => openMessage([app], note)}
            aria-keyshortcuts="M"
          >
            <Send className="h-4 w-4" aria-hidden="true" /> Message <Kbd>M</Kbd>
          </Button>
          {isPending && (
            <Button
              variant="outline"
              className={cn("h-11 rounded-xl px-4 text-[15px] font-semibold", REJECT_BUTTON)}
              onClick={() => setConfirmAction({ type: "reject", student: app })}
              aria-keyshortcuts="R"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Reject <Kbd>R</Kbd>
            </Button>
          )}
          {renderEmailMenu(app)}
        </div>
        <p className="hidden text-[13px] text-muted-foreground sm:block">
          {isPending
            ? "After a decision the next application opens automatically. J and K move up and down the list."
            : "J and K move up and down the list."}
        </p>
      </section>
    );
  };

  const filterBar = (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Search by name or email..."
          aria-label="Search applications by name or email"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-11 rounded-xl pl-9 sm:h-10"
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1.5 self-center text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Filters:
        </div>
        <div className="min-w-[8.5rem] flex-1 space-y-1 sm:flex-none">
          <label id="filter-mode-label" className="block text-[10px] uppercase tracking-wide text-muted-foreground">Mode</label>
          <Select value={filterMode} onValueChange={setFilterMode}>
            <SelectTrigger aria-labelledby="filter-mode-label" className="h-11 w-full text-xs sm:h-9 sm:w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="physical">Physical</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[8.5rem] flex-1 space-y-1 sm:flex-none">
          <label id="filter-cohort-label" className="block text-[10px] uppercase tracking-wide text-muted-foreground">Cohort</label>
          <Select value={filterCohort} onValueChange={setFilterCohort}>
            <SelectTrigger aria-labelledby="filter-cohort-label" className="h-11 w-full text-xs sm:h-9 sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cohorts</SelectItem>
              {cohorts.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[8.5rem] flex-1 space-y-1 sm:flex-none">
          <label id="filter-language-label" className="block text-[10px] uppercase tracking-wide text-muted-foreground">Language</label>
          <Select value={filterLanguage} onValueChange={setFilterLanguage}>
            <SelectTrigger aria-labelledby="filter-language-label" className="h-11 w-full text-xs sm:h-9 sm:w-[150px]"><SelectValue /></SelectTrigger>
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
        <div className="min-w-[8.5rem] flex-1 space-y-1 sm:flex-none">
          <label htmlFor="filter-from" className="block text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
          <Input id="filter-from" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-11 w-full text-xs sm:h-9 sm:w-[140px]" />
        </div>
        <div className="min-w-[8.5rem] flex-1 space-y-1 sm:flex-none">
          <label htmlFor="filter-to" className="block text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
          <Input id="filter-to" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-11 w-full text-xs sm:h-9 sm:w-[140px]" />
        </div>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-11 gap-1 text-xs sm:h-9">
            <X className="h-3.5 w-3.5" /> Clear ({activeFilterCount})
          </Button>
        )}
      </div>
    </div>
  );

  const renderList = () => {
    const isPending = view === "pending";
    const listLoading = !isPending && (decided[view as DecidedView] === null || decidedLoading);
    const total = sourceList.length;

    return (
      <section
        aria-label={`${view === "pending" ? "Pending" : view === "admitted" ? "Admitted" : "Rejected"} applications`}
        className="min-w-0 overflow-hidden rounded-[18px] border border-border bg-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-secondary/60 px-4 py-2.5">
          <label className="flex min-h-[44px] items-center gap-2.5 text-sm font-semibold text-foreground">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleSelectAll}
              disabled={visibleList.length === 0}
              aria-label="Select all applications in this list"
              className="h-[18px] w-[18px]"
            />
            {selectedVisible.length > 0 ? `${selectedVisible.length} selected` : "Select all"}
          </label>
          <span className="flex flex-wrap gap-2">
            {isPending && selectedVisible.length > 0 && (
              <Button
                size="sm"
                onClick={() => setConfirmAction({ type: "bulkApprove" })}
                disabled={bulkApproving}
                className={cn("h-11 rounded-[10px] px-3 text-[13px] font-bold sm:h-9", APPROVE_BUTTON)}
              >
                {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {bulkApproving ? "Approving..." : `Approve ${selectedVisible.length}`}
              </Button>
            )}
            {selectedVisible.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openMessage(selectedVisible)}
                className={cn("h-11 rounded-[10px] px-3 text-[13px] font-semibold sm:h-9", QUIET_BUTTON)}
              >
                Message {selectedVisible.length}
              </Button>
            )}
            {selectedVisible.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-11 text-xs text-muted-foreground sm:h-9">
                Clear
              </Button>
            )}
          </span>
        </div>
        <p className="border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
          {listLoading
            ? "Loading…"
            : visibleList.length === total
              ? `${total} ${total === 1 ? "application" : "applications"}${!isPending && total === 200 ? " (most recent 200)" : ""}`
              : `Showing ${visibleList.length} of ${total}`}
        </p>

        {listLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : visibleList.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="font-medium text-foreground">
              {total > 0
                ? "No applications match these filters"
                : isPending
                  ? "No pending applications"
                  : view === "admitted"
                    ? "No admitted applications"
                    : "No rejected applications"}
            </p>
            {isPending && total === 0 && (
              <p className="mt-1 text-sm text-muted-foreground">New registrations will appear here automatically</p>
            )}
          </div>
        ) : (
          <ul>
            {visibleList.map((app) => {
              const name = getFullName(app);
              const selected = current?.id === app.id;
              return (
                <li key={app.id} className={queueRowClass(selected)}>
                  <div className="flex items-center gap-1 py-1 pl-2 pr-4">
                    <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                      <Checkbox
                        checked={selectedIds.has(app.id)}
                        onCheckedChange={() => toggleSelect(app.id)}
                        aria-label={`Select ${name}`}
                        className="h-[18px] w-[18px]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => pickApplicant(app.id)}
                      aria-current={selected ? "true" : undefined}
                      className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg py-1.5 text-left text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <InitialsBadge name={name} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <strong className="truncate text-sm font-semibold">{name}</strong>
                        <span className="truncate text-xs text-muted-foreground">
                          {app.learning_mode || "Mode not given"}
                          {app.created_at ? ` · ${timeAgo(app.created_at)}` : ""}
                        </span>
                      </span>
                      {app.profile?.whatsapp_number_issue && (
                        <StatusPill tone="warn" className="shrink-0">WhatsApp issue</StatusPill>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  const renderRequests = () => (
    <div className="flex flex-col gap-5">
      {requestCount === 0 && (
        <Panel>
          <div className="px-4 py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600/70" aria-hidden="true" />
            <p className="font-medium text-foreground">No requests waiting</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Learning-mode changes and certificate name corrections appear here.
            </p>
          </div>
        </Panel>
      )}

      {certificateRequests.length > 0 && (
        <Panel title={`Certificate name changes · ${certificateRequests.length}`} titleId="cert-requests">
          <ul>
            {certificateRequests.map((s) => {
              const name = `${s.profile?.first_name || "Unknown"} ${s.profile?.last_name || "User"}`;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3.5 border-b border-border/60 px-5 py-3 last:border-b-0">
                  <InitialsBadge name={name} />
                  <span className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
                    <strong className="text-[15px] font-semibold text-foreground">{name}</strong>
                    <span className="text-[13px] text-muted-foreground">
                      Wants: <span className="font-medium text-foreground">{s.pending_name_change}</span>
                      {s.created_at ? ` · ${timeAgo(s.created_at)}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Button className={cn("h-11 rounded-[10px] px-3.5 font-bold sm:h-10", APPROVE_BUTTON)} onClick={() => handleCertificateRequest(s.id, 'approve')} aria-label={`Approve certificate name for ${name}`}>
                      <Check className="h-4 w-4" aria-hidden="true" /> Approve
                    </Button>
                    <Button variant="outline" className={cn("h-11 rounded-[10px] px-3.5 font-semibold sm:h-10", REJECT_BUTTON)} onClick={() => handleCertificateRequest(s.id, 'reject')} aria-label={`Reject certificate name for ${name}`}>
                      <X className="h-4 w-4" aria-hidden="true" /> Reject
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {learningModeRequests.length > 0 && (
        <Panel title={`Learning mode changes · ${learningModeRequests.length}`} titleId="mode-requests">
          <ul>
            {learningModeRequests.map((s) => {
              const name = `${s.profile?.first_name || "Unknown"} ${s.profile?.last_name || "User"}`;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3.5 border-b border-border/60 px-5 py-3 last:border-b-0">
                  <InitialsBadge name={name} />
                  <span className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
                    <strong className="text-[15px] font-semibold text-foreground">{name}</strong>
                    <span className="text-[13px] text-muted-foreground">
                      Current: {s.learning_mode || "—"} · Requested:{" "}
                      <span className="font-medium text-foreground">{s.requested_learning_mode}</span>
                      {s.created_at ? ` · ${timeAgo(s.created_at)}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Button className={cn("h-11 rounded-[10px] px-3.5 font-bold sm:h-10", APPROVE_BUTTON)} onClick={() => handleLearningModeRequest(s.id, 'approve')} aria-label={`Approve learning mode change for ${name}`}>
                      <Check className="h-4 w-4" aria-hidden="true" /> Approve
                    </Button>
                    <Button variant="outline" className={cn("h-11 rounded-[10px] px-3.5 font-semibold sm:h-10", REJECT_BUTTON)} onClick={() => handleLearningModeRequest(s.id, 'reject')} aria-label={`Reject learning mode change for ${name}`}>
                      <X className="h-4 w-4" aria-hidden="true" /> Reject
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-[18px]" />
          <Skeleton className="h-96 rounded-[18px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      <AdminPageHeader
        section="People"
        title="Applications"
        description="Admissions: review applications, learning-mode and certificate-name requests."
        actions={
          <div role="tablist" aria-label="Filter applications" className="flex flex-wrap gap-1.5">
            {TABS.map((tab, index) => {
              const selected = view === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => { tabRefs.current[tab.id] = el; }}
                  type="button"
                  role="tab"
                  id={`admissions-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls="admissions-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => switchView(tab.id)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                  className={cn(
                    "h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-[38px]",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground/80 hover:bg-secondary",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        }
      />

      <div
        id="admissions-panel"
        role="tabpanel"
        aria-labelledby={`admissions-tab-${view}`}
        className="flex flex-col gap-5"
      >
        {view === "requests" ? (
          renderRequests()
        ) : (
          <>
            {filterBar}
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              {renderList()}
              {current ? (
                renderDetail(current)
              ) : (
                <div className="hidden rounded-[18px] border border-dashed border-border p-10 text-center text-sm text-muted-foreground lg:block">
                  Pick an application to read it in full.
                </div>
              )}
            </div>
          </>
        )}
      </div>

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

      {/* Message dialog — an email through the same sender the Students page uses. */}
      <Dialog open={messageTargets.length > 0} onOpenChange={(open) => { if (!open && !sendingMessage) setMessageTargets([]); }}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {messageTargets.length === 1
                ? `Message ${getFullName(messageTargets[0])}`
                : `Message ${messageTargets.length} applicants`}
            </DialogTitle>
            <DialogDescription>
              Sent by email
              {messageTargets.length === 1 ? ` to ${messageTargets[0].profile?.email}` : " to each applicant separately"}.
              This does not change their application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="message-subject">Subject</Label>
              <Input
                id="message-subject"
                value={messageSubject}
                onChange={(e) => setMessageSubject(e.target.value)}
                placeholder="Email subject..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="message-body">Message</Label>
              <Textarea
                id="message-body"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Write your message here..."
                rows={6}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMessageTargets([])} disabled={sendingMessage}>Cancel</Button>
            <Button
              onClick={handleSendMessage}
              disabled={sendingMessage || !messageSubject.trim() || !messageBody.trim()}
              className="gap-2"
            >
              {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

export default AdminAdmissions;
