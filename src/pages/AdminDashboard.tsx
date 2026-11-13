import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, BookOpen, Calendar, UserPlus, CheckCircle, XCircle,
  BadgeDollarSign, Award, ChevronRight, CalendarCheck,
  ClipboardCheck, Megaphone, BarChart3, Folder, Plus,
  MessageCircle,
} from "lucide-react";
import ActionCentre, { type ActionQueue } from "@/components/admin/ActionCentre";
import PortalPulse from "@/components/admin/PortalPulse";
import AssistantChat from "@/components/portal/AssistantChat";
import { KpiTile, Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { APPROVE_BUTTON, QUIET_BUTTON, REJECT_BUTTON } from "@/components/redesign/admin/styles";
import { preloadPath } from "@/routes/lazy-pages";
import { useAuth } from "@/contexts/useAuth";
import { toast } from "sonner";

interface PendingStudent {
  id: string;
  learning_mode: string | null;
  profile: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

interface RecentStudent {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

interface LearningModeRequest {
  id: string;
  learning_mode: string | null;
  requested_learning_mode: string | null;
  profile: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

interface CertificateNameRequest {
  id: string;
  pending_name_change: string | null;
  profile: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

interface DashboardStats {
  totalStudents: number;
  pendingCount: number;
  activeCourses: number;
  activeCohort: string | null;
  recentStudents: RecentStudent[];
  pendingStudents: PendingStudent[];
  learningModeRequests: LearningModeRequest[];
  certificateNameRequests: CertificateNameRequest[];
  /** Receipts filed and awaiting a verify/reject decision. */
  pendingPayments: number;
  /** Student self check-ins nobody has verified yet. */
  unverifiedCheckIns: number;
  /** Exam attempts submitted but not yet graded (the marking backlog). */
  papersToMark: number;
  /** WhatsApp conversations the bot handed to a person and nobody closed. */
  openHandovers: number;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** Shortcuts to the create forms admins open most, top right of the page. */
const QUICK_CREATE = [
  { label: "Announcement", path: "/admin/announcements" },
  { label: "Task", path: "/admin/assignments" },
  { label: "Exam", path: "/admin/exams/new" },
  { label: "Material", path: "/admin/materials" },
  { label: "Event", path: "/admin/calendar" },
  { label: "Course", path: "/admin/courses" },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const [studentsRes, pendingCountRes, coursesRes, cohortRes, recentRes, pendingRes, learningModeRequestsRes, certRequestsRes, pendingPaymentsRes, checkInsRes, toMarkRes, handoversRes] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_staff_preview", false),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("is_staff_preview", false)
          .ilike("admission_status", "pending"),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("cohorts").select("name").eq("is_active", true).maybeSingle(),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url, created_at")
          .eq("role", "student")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("students")
          .select("id, learning_mode, profile:profiles(first_name, last_name, avatar_url)")
          .eq("is_staff_preview", false)
          .ilike("admission_status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("students")
          .select("id, learning_mode, requested_learning_mode, profile:profiles(first_name, last_name, avatar_url)", { count: "exact" })
          .eq("is_staff_preview", false)
          .not("requested_learning_mode", "is", null)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("students")
          .select("id, pending_name_change, profile:profiles(first_name, last_name, avatar_url)", { count: "exact" })
          .eq("is_staff_preview", false)
          .not("pending_name_change", "is", null)
          .order("created_at", { ascending: false })
          .limit(10),
        // Receipts waiting on staff. Counted here because an unverified payment
        // is work outstanding in exactly the same way a pending admission is,
        // and it was the one queue the dashboard never mentioned.
        supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING"),
        // The three backlogs the dashboard never surfaced: check-ins waiting
        // for verification, papers waiting to be marked, and WhatsApp chats the
        // bot handed to a person. A query a role cannot read just counts 0.
        supabase
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("is_verified", false),
        supabase
          .from("exam_attempts")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
        supabase
          .from("whatsapp_conversations")
          .select("jid", { count: "exact", head: true })
          .not("handover_at", "is", null)
          .is("handover_closed_at", null),
      ]);

      setStats({
        totalStudents: studentsRes.count || 0,
        pendingCount: pendingCountRes.count || 0,
        activeCourses: coursesRes.count || 0,
        activeCohort: cohortRes.data?.name || null,
        recentStudents: recentRes.data || [],
        pendingStudents: (pendingRes.data) || [],
        learningModeRequests: (learningModeRequestsRes.data) || [],
        certificateNameRequests: (certRequestsRes.data) || [],
        pendingPayments: pendingPaymentsRes.count || 0,
        unverifiedCheckIns: checkInsRes.count || 0,
        papersToMark: toMarkRes.count || 0,
        openHandovers: handoversRes.count || 0,
      });
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const handleApproval = async (studentId: string, status: "Admitted" | "Rejected") => {
    try {
      const admission_status = status === "Admitted" ? "ADMITTED" : "REJECTED";
      const is_approved = status === "Admitted";

      const { data, error } = await supabase
        .from("students")
        .update({ admission_status, is_approved })
        .eq("id", studentId)
        .select();

      console.log("[AdminDashboard] Approval result:", { data, error });

      if (error) {
        console.error("Supabase error:", error);
        toast.error(error.message || "Failed to update status");
        return;
      }

      toast.success(
        status === "Admitted"
          ? "Student Admitted Successfully"
          : "Student rejected"
      );
      setStats((prev) =>
        prev
          ? {
              ...prev,
              pendingStudents: prev.pendingStudents.filter((s) => s.id !== studentId),
              pendingCount: Math.max(0, prev.pendingCount - 1),
              totalStudents: prev.totalStudents,
            }
          : null
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update status";
      console.error("Approval error:", err);
      toast.error(msg);
    }
  };

  const handleLearningModeRequest = async (studentId: string, action: "approve" | "reject") => {
    try {
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("profile_id, learning_mode, requested_learning_mode")
        .eq("id", studentId)
        .single();

      if (studentError || !studentData) {
        throw studentError || new Error("Could not load student request");
      }

      const updatePayload: TablesUpdate<'students'> = { requested_learning_mode: null };
      if (action === "approve") {
        updatePayload.learning_mode = studentData.requested_learning_mode || null;
      }

      const { data, error } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("id", studentId)
        .select("profile_id, learning_mode, requested_learning_mode")
        .single();

      if (error || !data) {
        throw error || new Error("Failed to update learning mode request");
      }

      if (data.profile_id) {
        const notificationTitle =
          action === "approve"
            ? "Learning mode change approved"
            : "Learning mode change denied";
        const notificationBody =
          action === "approve"
            ? `Your learning mode has been updated to ${data.learning_mode}.`
            : "Your learning mode change request was rejected by an administrator.";

        await supabase.from("notifications").insert({
          user_id: data.profile_id,
          title: notificationTitle,
          body: notificationBody,
          type: "learning_mode_request",
          link: "/student/profile",
        });
      }

      toast.success(
        action === "approve"
          ? "Learning mode request approved"
          : "Learning mode request rejected"
      );

      setStats((prev) =>
        prev
          ? {
              ...prev,
              learningModeRequests: prev.learningModeRequests.filter((s) => s.id !== studentId),
            }
          : null
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process request";
      console.error("Learning mode request error:", err);
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const learningModeCount = stats.learningModeRequests?.length || 0;
  const certificateNameCount = stats.certificateNameRequests?.length || 0;
  const pendingTotal =
    stats.pendingCount + learningModeCount + certificateNameCount + stats.pendingPayments;

  // Each queue names the page that actually does the work, so the dashboard
  // stays a way in rather than a second place to approve things. Each row has
  // one explicit verb, as on the AdminHome board.
  const QUEUES: ActionQueue[] = [
    {
      label: "New applications",
      noun: "application",
      count: stats.pendingCount,
      icon: UserPlus,
      path: "/admin/admissions",
      tone: "violet",
      cta: "Review",
    },
    {
      label: "Payments to verify",
      noun: "receipt",
      count: stats.pendingPayments,
      icon: BadgeDollarSign,
      path: "/admin/payments",
      tone: "amber",
      cta: "Verify",
      detail: `${stats.pendingPayments} ${stats.pendingPayments === 1 ? "receipt" : "receipts"} uploaded and waiting`,
    },
    {
      label: "Learning mode change requests",
      noun: "request",
      count: learningModeCount,
      icon: BookOpen,
      path: "/admin/admissions",
      tone: "violet",
      cta: "Open",
    },
    {
      // Previously counted into the dashboard's totals but shown nowhere, so
      // the only way to find these was to already know they were under
      // Admissions.
      label: "Certificate name corrections",
      noun: "request",
      count: certificateNameCount,
      icon: Award,
      path: "/admin/admissions",
      tone: "violet",
      cta: "Open",
    },
    {
      label: "Check-ins to verify",
      noun: "check-in",
      count: stats.unverifiedCheckIns,
      icon: CalendarCheck,
      path: "/admin/attendance",
      tone: "amber",
      cta: "Verify",
      detail: "Student self check-ins nobody has verified yet",
    },
    {
      label: "Answers to mark",
      noun: "exam paper",
      count: stats.papersToMark,
      icon: ClipboardCheck,
      path: "/admin/exams",
      tone: "violet",
      cta: "Mark",
    },
    {
      label: "WhatsApp chats handed to you",
      noun: "chat",
      count: stats.openHandovers,
      icon: MessageCircle,
      path: "/admin/whatsapp/log",
      tone: "amber",
      cta: "Reply",
      detail: "The bot stopped replying and asked for a person",
    },
  ];

  const waitingTotal = QUEUES.reduce((sum, queue) => sum + queue.count, 0);

  // A short path to the pages staff open every day. The sidebar has all of
  // them, but on a phone it is behind a drawer.
  const SHORTCUTS = [
    { label: "Students", icon: Users, path: "/admin/students" },
    { label: "Attendance", icon: CalendarCheck, path: "/admin/attendance" },
    { label: "Tasks", icon: ClipboardCheck, path: "/admin/assignments" },
    { label: "Materials", icon: Folder, path: "/admin/materials" },
    { label: "Fees", icon: BadgeDollarSign, path: "/admin/fees" },
    { label: "Announce", icon: Megaphone, path: "/admin/announcements" },
    { label: "Calendar", icon: Calendar, path: "/admin/calendar" },
    { label: "Analytics", icon: BarChart3, path: "/admin/analytics" },
  ];

  const nameOf = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
    `${p?.first_name || "Unknown"} ${p?.last_name || "User"}`;

  const personRow = (
    key: string,
    profileLike: { first_name?: string | null; last_name?: string | null; avatar_url?: string | null } | null | undefined,
    sub: ReactNode,
    trailing?: ReactNode,
  ) => (
    <li key={key} className="flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-b-0">
      <Avatar className="h-9 w-9">
        {profileLike?.avatar_url && <AvatarImage src={profileLike.avatar_url} alt="" />}
        <AvatarFallback className="bg-secondary text-xs font-extrabold text-secondary-foreground">
          {(profileLike?.first_name?.[0] || "")}{(profileLike?.last_name?.[0] || "")}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{nameOf(profileLike)}</p>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
      {trailing}
    </li>
  );

  const decisionButtons = (name: string, onApprove: () => void, onReject: () => void) => (
    <div className="flex shrink-0 gap-1.5">
      <Button
        size="sm"
        className={`h-11 px-3 md:h-9 ${APPROVE_BUTTON}`}
        onClick={onApprove}
        aria-label={`Approve ${name}`}
      >
        <CheckCircle className="h-4 w-4" aria-hidden="true" /> Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={`h-11 px-3 md:h-9 ${REJECT_BUTTON}`}
        onClick={onReject}
        aria-label={`Reject ${name}`}
      >
        <XCircle className="h-4 w-4" aria-hidden="true" /> Reject
      </Button>
    </div>
  );

  const emptyLine = (text: string) => <p className="px-5 py-4 text-sm text-muted-foreground">{text}</p>;

  const footerButton = (label: string, path: string) => (
    <div className="border-t border-border/60 px-5 py-3">
      <Button variant="outline" className={`h-11 w-full md:h-10 ${QUIET_BUTTON}`} onClick={() => navigate(path)}>
        {label} <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-[22px]">
      {/* Inbox first: the greeting says how much is waiting before anything else. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[28px]">
            {greeting()}{profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {waitingTotal > 0
              ? `${waitingTotal} ${waitingTotal === 1 ? "thing needs" : "things need"} you. Most take one click.`
              : "Nothing is waiting on you right now."}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-11 rounded-xl px-4 font-bold">
              <Plus className="h-4 w-4" aria-hidden="true" /> New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {QUICK_CREATE.map((q) => (
              <DropdownMenuItem key={q.path + q.label} asChild>
                <Link to={q.path} onMouseEnter={() => preloadPath(q.path)} className="min-h-10">
                  {q.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KPI row: only the figures the dashboard actually loads. */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiTile label="Total students" value={stats.totalStudents} note="All registered students" />
        <KpiTile
          label="Awaiting a decision"
          value={pendingTotal}
          note={pendingTotal > 0 ? "Admissions, requests and receipts" : "Nothing waiting"}
          tone={pendingTotal > 0 ? "warn" : "good"}
        />
        <KpiTile
          label="Active courses"
          value={stats.activeCourses}
          // Reads the active cohort rather than naming a session in the source,
          // which left the card claiming 2025/26 long after that session closed.
          note={stats.activeCohort ? `${stats.activeCohort} session` : "Current session"}
        />
        <KpiTile
          label="Active cohort"
          value={<span className="text-[22px] sm:text-[26px]">{stats.activeCohort || "—"}</span>}
          note={stats.activeCohort ? "Current session" : "None active"}
          tone={stats.activeCohort ? "neutral" : "warn"}
        />
      </div>

      {/* What is waiting on the left; asking, creating and portal use on the right. */}
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[3_1_520px]">
          <ActionCentre queues={QUEUES} loading={loading} />
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-3.5">
          {/* A question is usually faster than finding the page that answers
              it, and most of these cost no model call at all. */}
          <AssistantChat audience="admin" />
          <Panel title="Quick create" titleId="quick-create-title">
            <div className="grid grid-cols-2 gap-2 p-4">
              {QUICK_CREATE.map((q) => (
                <Link
                  key={q.path + q.label}
                  to={q.path}
                  onMouseEnter={() => preloadPath(q.path)}
                  onFocus={() => preloadPath(q.path)}
                  className="flex h-11 items-center justify-center rounded-[10px] border border-input bg-card px-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {q.label}
                </Link>
              ))}
            </div>
          </Panel>
          <PortalPulse />
        </div>
      </div>

      {/* Quick navigation */}
      <Panel title="Jump to" titleId="jump-to-title">
        <div className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-8">
          {SHORTCUTS.map((shortcut) => (
            <Link
              key={shortcut.path}
              to={shortcut.path}
              onMouseEnter={() => preloadPath(shortcut.path)}
              onFocus={() => preloadPath(shortcut.path)}
              className="flex min-h-11 flex-col items-center gap-2 rounded-xl bg-muted/50 p-3 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-card">
                <shortcut.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <span className="text-center text-[11px] font-semibold text-foreground">{shortcut.label}</span>
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Recent registrations" titleId="recent-registrations-title">
          {stats.recentStudents.length === 0 ? (
            emptyLine("No recent registrations.")
          ) : (
            <ul>
              {stats.recentStudents.map((s) =>
                personRow(
                  s.id,
                  s,
                  s.email,
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>,
                ),
              )}
            </ul>
          )}
          {footerButton("View all students", "/admin/students")}
        </Panel>

        <Panel
          title="Pending approvals"
          titleId="pending-approvals-title"
          actions={stats.pendingCount > 0 ? <StatusPill tone="warn">{stats.pendingCount} pending</StatusPill> : undefined}
        >
          {stats.pendingStudents.length === 0 ? (
            emptyLine("No pending applications.")
          ) : (
            <ul>
              {stats.pendingStudents.map((s) =>
                personRow(
                  s.id,
                  s.profile,
                  s.learning_mode || "—",
                  decisionButtons(
                    nameOf(s.profile),
                    () => handleApproval(s.id, "Admitted"),
                    () => handleApproval(s.id, "Rejected"),
                  ),
                ),
              )}
            </ul>
          )}
          {/* The card shows the first ten; the rest are on the admissions
              page, which is also where an application can be read in full. */}
          {footerButton("Review admissions", "/admin/admissions")}
        </Panel>

        <Panel title="Learning mode change requests" titleId="learning-mode-title">
          {stats.learningModeRequests.length === 0 ? (
            emptyLine("No pending learning mode requests.")
          ) : (
            <ul>
              {stats.learningModeRequests.map((s) =>
                personRow(
                  s.id,
                  s.profile,
                  <>Current: {s.learning_mode || "—"} · Requested: {s.requested_learning_mode}</>,
                  decisionButtons(
                    nameOf(s.profile),
                    () => handleLearningModeRequest(s.id, "approve"),
                    () => handleLearningModeRequest(s.id, "reject"),
                  ),
                ),
              )}
            </ul>
          )}
        </Panel>

        {/* Certificate Name Requests. These were being fetched and counted into
            the dashboard's totals while appearing nowhere on the page, so a
            waiting request was invisible unless staff already knew to look
            under Admissions. Approving one needs the certificate in front of
            you, so this lists them and links there rather than deciding here. */}
        <Panel title="Certificate name requests" titleId="certificate-name-title">
          {stats.certificateNameRequests.length === 0 ? (
            emptyLine("No pending certificate name changes.")
          ) : (
            <>
              <ul>
                {stats.certificateNameRequests.map((s) =>
                  personRow(s.id, s.profile, <>Wants: {s.pending_name_change}</>),
                )}
              </ul>
              {footerButton("Review name changes", "/admin/admissions")}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default AdminDashboard;
