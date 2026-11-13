import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { differenceInCalendarDays, format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fetchStudentAttendance } from "@/lib/attendance-queries";
import { useAuth } from "@/contexts/useAuth";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import ProgressSummary from "@/components/student/ProgressSummary";
import UpNext from "@/components/student/UpNext";
import TodayTimetable from "@/components/redesign/student/TodayTimetable";
import ApplicationTracker from "@/components/redesign/student/ApplicationTracker";
import { useTodayPlan } from "@/components/redesign/student/useTodayPlan";
import NotificationsBell from "@/components/NotificationsBell";
import AssistantCard from "@/components/student/AssistantCard";
import AssistantChat from "@/components/portal/AssistantChat";
import { useAssistantContext } from "@/lib/assistant-places";
import { preloadPath } from "@/routes/lazy-pages";
import { ClipboardList, Calendar, Loader2, Sparkles, GraduationCap, Award, FileText } from "lucide-react";
import { toast } from "sonner";
import Reveal from "@/components/Reveal";
import { isStudentProfileComplete } from "@/lib/profile-complete";
import { splitFeesBySession } from "@/lib/fee-sessions";

interface FeeBreakdown {
  paid: number;
  unpaid: number;
  partial: number;
  total: number;
  status: string;
}

interface DashboardData {
  firstName: string;
  admissionStatus: string | null;
  attendanceRate: number | null;
  /** Counted sessions attended (present or late) and held, for the tile. */
  attendanceAttended: number;
  attendanceHeld: number;
  totalCourses: number;
  completedCourses: number;
  pendingAssignments: number;
  totalAssignments: number;
  /** The tasks not yet submitted, soonest due first, for "Due soon". */
  dueTasks: DueTask[];
  fees: FeeBreakdown;
  upcomingEvents: Array<{ id: string; title: string; start_date: string; end_date: string | null; category: string | null }>;
  announcements: Array<{ title: string; body: string; published_at: string | null }>;
}

interface DueTask {
  id: string;
  title: string;
  due_date: string | null;
  max_points: number | null;
  courseCode: string | null;
}

interface CohortOption {
  id: string;
  name: string;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}

const EMPTY_DATA: DashboardData = {
  firstName: "Student",
  admissionStatus: null,
  attendanceRate: null,
  attendanceAttended: 0,
  attendanceHeld: 0,
  totalCourses: 0,
  completedCourses: 0,
  pendingAssignments: 0,
  totalAssignments: 0,
  dueTasks: [],
  fees: { paid: 0, unpaid: 0, partial: 0, total: 0, status: "N/A" },
  upcomingEvents: [],
  announcements: [],
};

const StudentDashboard = () => {
  const { student, user, profile, isProfileResolved, refreshProfile } = useAuth();
  const assistant = useAssistantContext();
  const plan = useTodayPlan();
  // "Ask Barnabas" in the More sheet links here with ?ask=1 to open the chat.
  const [searchParams, setSearchParams] = useSearchParams();
  const askRequested = searchParams.get("ask") === "1";
  const clearAsk = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("ask");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // Identity comes from the auth context, which is the one place that reads and
  // caches these rows. The dashboard used to re-query profiles/students itself,
  // so two copies of "is this profile complete?" raced on every load — that
  // second copy is what popped the completion dialog over a finished profile.
  const fullName = useMemo(
    () =>
      [profile?.first_name, profile?.middle_name, profile?.last_name].filter(Boolean).join(" ") ||
      (user?.user_metadata?.full_name as string | undefined) ||
      "Student",
    [profile?.first_name, profile?.middle_name, profile?.last_name, user],
  );
  const studentId = student?.id ?? null;
  const cohortId = student?.cohort_id ?? null;
  const admissionStatus = student?.admission_status ?? null;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfileCompletion, setSavingProfileCompletion] = useState(false);
  const [profileCompletionForm, setProfileCompletionForm] = useState({
    gender: "",
    age: "",
    cohort_id: "",
    learning_mode: "",
  });
  const [showConfirmMode, setShowConfirmMode] = useState(false);
  const [cohortOptions, setCohortOptions] = useState<CohortOption[]>([]);
  const [allCohortOptions, setAllCohortOptions] = useState<CohortOption[]>([]);
  const [isReturningStudent, setIsReturningStudent] = useState(false);
  const [loadingAllCohorts, setLoadingAllCohorts] = useState(false);

  // Keep the form in step with the stored row. Keyed on the values rather than
  // the row object: the auth context hands out a fresh object after every
  // background revalidation, which would otherwise wipe what the user is typing.
  useEffect(() => {
    if (!student) return;
    setProfileCompletionForm({
      gender: student.gender || "",
      age: student.age ? String(student.age) : "",
      cohort_id: student.cohort_id || "",
      learning_mode: student.learning_mode || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.gender, student?.age, student?.cohort_id, student?.learning_mode]);

  /**
   * What this dialog still exists for: a cohort. /complete-profile already
   * collects name, phone, gender, age and learning mode before the route guard
   * lets anyone in here — but it can't ask for a cohort, so a student whose
   * signup never got one lands here without one. The remaining fields stay in
   * the form as a safety net for rows that predate that flow.
   *
   * Gated on isProfileResolved so it can only ever open on real, settled data —
   * never on the blank moment before the profile read comes back.
   */
  const completionOverridden =
    (student as { profile_complete_override?: boolean | null } | null)?.profile_complete_override === true;
  const needsCompletion =
    isProfileResolved &&
    !!student &&
    !completionOverridden &&
    (!student.cohort_id || !isStudentProfileComplete(profile, student));
  const showProfileCompletion = needsCompletion;

  const normalizeStatus = (s: string | null | undefined) => (s ?? "").toUpperCase();

  const handleReturningToggle = useCallback(async (checked: boolean) => {
    setIsReturningStudent(checked);
    if (checked && allCohortOptions.length === 0) {
      setLoadingAllCohorts(true);
      try {
        const { data } = await supabase
          .from("cohorts")
          .select("id, name, is_active, start_date, end_date")
          .order("start_date", { ascending: false });
        if (data) setAllCohortOptions(data as CohortOption[]);
      } finally {
        setLoadingAllCohorts(false);
      }
    }
  }, [allCohortOptions.length]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) {
        setData(EMPTY_DATA);
        return;
      }

      const [announcementsRes, cohortsRes] = await Promise.all([
        supabase.from("announcements").select("title, body, published_at").eq("is_published", true).order("published_at", { ascending: false }).limit(3),
        supabase.from("cohorts").select("id, name").eq("is_active", true).order("created_at", { ascending: false }),
      ]);

      const firstName = fullName;
      const statusUpper = normalizeStatus(admissionStatus);
      const isAdmitted = statusUpper === "ADMITTED" || statusUpper === "APPROVED";

      if (cohortsRes.data) {
        setCohortOptions(cohortsRes.data as CohortOption[]);
      }

      let attendanceRate: number | null = null;
      let attendanceAttended = 0;
      let attendanceHeld = 0;
      let pendingAssignments = 0;
      let dueTasks: DueTask[] = [];
      let totalAssignments = 0;
      let fees: FeeBreakdown = { paid: 0, unpaid: 0, partial: 0, total: 0, status: "N/A" };
      let completedCourses = 0;
      let cohortCoursesCount = 0;
      let upcomingEvents: DashboardData["upcomingEvents"] = [];

      if (cohortId) {
        try {
          const [{ data: completedData }, { data: cohortCourses }] = await Promise.all([
            supabase.from("courses").select("id").eq("cohort_id", cohortId).eq("is_completed", true),
            supabase.from("courses").select("id").eq("cohort_id", cohortId),
          ]);
          completedCourses = completedData?.length ?? 0;
          cohortCoursesCount = cohortCourses?.length ?? 0;
        } catch (e) {
          // One section failing shouldn't take the dashboard down, but it must
          // not pass for real data either — an empty card and a blocked query
          // look identical on screen.
          console.warn("[Dashboard] Course counts unavailable:", e);
        }
      }

      if (!cohortId) {
        cohortCoursesCount = 0;
      }

      if (studentId) {
        try {
          // Measured against the classes the cohort actually held, not the rows
          // on file — see src/lib/attendance.ts.
          const tally = await fetchStudentAttendance(studentId, cohortId);
          attendanceRate = tally.rate;
          attendanceAttended = tally.present + tally.late;
          attendanceHeld = tally.total;
        } catch (e) {
          console.warn("[Dashboard] Attendance unavailable:", e);
        }

        if (isAdmitted && cohortId) {
          try {
            const [assignRes, submissionRes] = await Promise.all([
              // Offline records are never pending — the work is already done and marked.
              supabase
                .from("assignments")
                .select("id, title, due_date, max_points, courses(code)")
                .eq("cohort_id", cohortId)
                .eq("is_manual_record", false),
              supabase.from("assignment_submissions").select("assignment_id").eq("student_id", studentId),
            ]);
            const allIds = new Set((assignRes.data ?? []).map((a) => a.id));
            const submittedIds = new Set((submissionRes.data ?? []).map((s) => s.assignment_id));
            totalAssignments = allIds.size;
            pendingAssignments = [...allIds].filter((id) => !submittedIds.has(id)).length;
            // Soonest due first; tasks with no due date go last.
            dueTasks = (assignRes.data ?? [])
              .filter((a) => !submittedIds.has(a.id))
              .map((a) => ({
                id: a.id,
                title: a.title,
                due_date: a.due_date,
                max_points: a.max_points,
                courseCode: (a.courses as { code: string } | null)?.code ?? null,
              }))
              .sort((a, b) =>
                a.due_date && b.due_date
                  ? a.due_date.localeCompare(b.due_date)
                  : a.due_date
                    ? -1
                    : b.due_date
                      ? 1
                      : 0,
              );
          } catch (e) {
            console.warn("[Dashboard] Assignments unavailable:", e);
          }
        }

        try {
          const { data: allFees } = await supabase
            .from("fees")
            .select("payment_status, cohort_id, waived")
            .eq("student_id", studentId);
          // The current session only — see src/lib/fee-sessions.ts. Counting a
          // session the student has moved on from would report its write-off as
          // this session's unpaid fees.
          const feesData = splitFeesBySession(allFees || [], cohortId).current;
          if (feesData.length > 0) {
            const paid = feesData.filter(f => f.payment_status === "Paid" || f.waived).length;
            const unpaid = feesData.filter(f => f.payment_status === "Unpaid" && !f.waived).length;
            const partial = feesData.filter(f => f.payment_status === "Partial" && !f.waived).length;
            const total = feesData.length;
            let status = "N/A";
            if (paid === total) status = "Paid";
            else if (unpaid === total) status = "Unpaid";
            else status = "Partial";
            fees = { paid, unpaid, partial, total, status };
          }
        } catch (e) {
          console.warn("[Dashboard] Fees unavailable:", e);
        }
      }

      try {
        const orQuery = cohortId
          ? `target_cohort_id.is.null,target_cohort_id.eq.${cohortId}`
          : `target_cohort_id.is.null`;
        const { data: eventsData } = await supabase
          .from("school_events")
          .select("id, title, start_date, end_date, category")
          .or(orQuery)
          .gte("start_date", new Date().toISOString())
          .order("start_date", { ascending: true })
          .limit(5);
        if (eventsData) {
          upcomingEvents = eventsData;
        }
      } catch (e) {
        console.warn("[Dashboard] Upcoming events unavailable:", e);
      }

      setData({
        firstName,
        admissionStatus,
        attendanceRate,
        attendanceAttended,
        attendanceHeld,
        totalCourses: cohortCoursesCount,
        completedCourses,
        pendingAssignments,
        totalAssignments,
        dueTasks,
        fees,
        upcomingEvents,
        announcements: announcementsRes.data ?? [],
      });

    } catch (err) {
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
    // Primitive deps only: the auth context hands out fresh row objects after
    // every background revalidation, and depending on those objects would
    // re-run the whole dashboard (and flash its skeletons) each time.
  }, [user, fullName, studentId, cohortId, admissionStatus]);

  useEffect(() => { load(); }, [load]);

  const saveProfileCompletion = async () => {
    if (!user) {
      toast.error("Your session expired. Please log in again.");
      return;
    }

    const parsedAge = Number(profileCompletionForm.age);
    if (!profileCompletionForm.gender) { toast.error("Please select your gender."); return; }
    if (!Number.isInteger(parsedAge) || parsedAge <= 0) { toast.error("Please enter a valid age."); return; }
    if (!profileCompletionForm.cohort_id) { toast.error("Please select your cohort."); return; }
    if (!profileCompletionForm.learning_mode) { toast.error("Please select your learning mode."); return; }

    setSavingProfileCompletion(true);
    try {
      const updatePayload: TablesUpdate<"students"> = {
        gender: profileCompletionForm.gender,
        age: parsedAge,
        cohort_id: profileCompletionForm.cohort_id,
        learning_mode: profileCompletionForm.learning_mode,
      };

      const { error } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("profile_id", user.id)
        .select();

      if (error) {
        throw new Error(error.message);
      }

      toast.success("Profile details saved.");
      // The auth context owns the copy of the student row this dialog is driven
      // by, so re-reading it is what actually closes the dialog.
      await refreshProfile();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile details.");
    } finally {
      setSavingProfileCompletion(false);
    }
  };

  const statusUpper = normalizeStatus(admissionStatus);
  const isPending = statusUpper === "PENDING";
  const isAdmitted = statusUpper === "ADMITTED" || statusUpper === "APPROVED";

  /**
   * The quick actions, which now depend on what the school has switched on.
   *
   * Study is listed only when a study feature is actually live: the page itself
   * renders an empty shell when both flags are off, so a permanent tile would
   * be a button to nowhere. Exams and Calendar were reachable only through the
   * sidebar, which on a phone is behind a drawer — they are the two pages a
   * student most often wants next from here.
   */
  // Same answer the assistant card uses, so the tile and the card can never
  // disagree about whether Study has anything on it.
  const { studyOn } = assistant;

  const QUICK_ACTIONS = [
    { label: "Submit Task", icon: ClipboardList, path: "/student/assignments" },
    { label: "Exams", icon: FileText, path: "/student/exams" },
    { label: "View Grades", icon: Award, path: "/student/grades" },
    { label: "Materials", icon: FileText, path: "/student/materials" },
    ...(studyOn
      ? [{ label: "Study", icon: Sparkles, path: "/student/study" }]
      : []),
    { label: "Transcript", icon: GraduationCap, path: "/student/transcript" },
    { label: "Calendar", icon: Calendar, path: "/student/calendar" },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const now = new Date();
  const firstName = profile?.first_name?.trim() || fullName.split(" ")[0];

  /**
   * Due soon: the three unsubmitted tasks due first, from the same read that
   * counts pending tasks. Overdue ones lead — they are the most urgent.
   */
  const dueSoon = (data?.dueTasks ?? []).slice(0, 3);
  const dueBadge = (due: string | null): { text: string; className: string } | null => {
    if (!due) return null;
    const d = new Date(due);
    const soon = "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
    const later = "bg-muted text-foreground/80";
    if (d.getTime() < now.getTime()) return { text: "Overdue", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" };
    if (isToday(d)) return { text: "Today", className: soon };
    if (isTomorrow(d)) return { text: "Tomorrow", className: soon };
    if (differenceInCalendarDays(d, now) < 7) return { text: format(d, "EEEE"), className: later };
    return { text: format(d, "d MMM"), className: later };
  };

  /** The four record tiles: attendance and fees first, as on the board. */
  const tiles = (() => {
    const rate = data?.attendanceRate ?? null;
    const held = data?.attendanceHeld ?? 0;
    const f = data?.fees ?? EMPTY_DATA.fees;
    const totalCourses = data?.totalCourses ?? 0;
    const completed = data?.completedCourses ?? 0;
    const pending = data?.pendingAssignments ?? 0;
    const totalTasks = data?.totalAssignments ?? 0;
    const good = "text-emerald-700 dark:text-emerald-400";
    const warn = "text-amber-800 dark:text-amber-300";
    const bad = "text-red-700 dark:text-red-400";
    return [
      {
        label: "Attendance",
        path: "/student/attendance",
        value: rate != null ? `${rate}%` : "—",
        note: rate == null ? null : rate >= 75 ? "Great standing" : rate >= 50 ? "Needs improvement" : "At risk",
        noteClass: rate == null ? undefined : rate >= 75 ? good : rate >= 50 ? warn : bad,
        detail: held > 0 ? `${data?.attendanceAttended ?? 0} of ${held} sessions` : null,
      },
      {
        label: "Fees",
        path: "/student/fees",
        value: f.status === "N/A" ? "—" : f.status,
        note: f.total === 0 ? null : f.status === "Paid" ? "All settled" : "Upload payment proof",
        noteClass: f.status === "Paid" ? good : f.status === "Unpaid" ? bad : warn,
        detail: f.total > 0 ? `${f.paid} paid · ${f.unpaid + f.partial} pending` : null,
      },
      {
        label: "Courses",
        path: "/student/courses",
        value: String(totalCourses),
        note: null,
        noteClass: undefined,
        detail: totalCourses > 0 ? `${completed} of ${totalCourses} completed` : null,
      },
      {
        label: "Pending tasks",
        path: "/student/assignments",
        value: isPending ? "—" : String(pending),
        note: isPending || totalTasks === 0 ? null : pending === 0 ? "All submitted" : null,
        noteClass: good,
        detail: !isPending && totalTasks > 0 ? `${totalTasks - pending} submitted · ${totalTasks} total` : null,
      },
    ];
  })();

  const getCategoryColor = (cat: string | null) => {
    switch ((cat || '').toUpperCase()) {
      case 'HOLIDAY': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
      case 'EXAM': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case 'EVENT': return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
      case 'BREAK': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
      default: return 'bg-primary/10 text-primary';
    }
  };

  return (
    <>
      {/* Profile Completion Dialog — driven by the auth context's settled
          student row, so it can't appear while anything is still resolving. */}
      <Dialog open={showProfileCompletion} onOpenChange={() => undefined}>
        <DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Complete your profile</DialogTitle>
            <DialogDescription>Please provide your gender, age, and cohort selection to continue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Gender</Label>
              <select className="w-full border border-border bg-background p-2 rounded" value={profileCompletionForm.gender} onChange={(e) => setProfileCompletionForm(p => ({...p, gender: e.target.value}))}>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Learning Mode</Label>
              <select className="w-full border border-border bg-background p-2 rounded" value={profileCompletionForm.learning_mode} onChange={(e) => setProfileCompletionForm(p => ({...p, learning_mode: e.target.value}))}>
                <option value="">Select learning mode</option>
                <option value="Online">Online</option>
                <option value="Physical">Physical</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input type="number" value={profileCompletionForm.age} onChange={(e) => setProfileCompletionForm(p => ({...p, age: e.target.value}))} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Cohort</Label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={isReturningStudent}
                    onChange={(e) => handleReturningToggle(e.target.checked)}
                  />
                  I'm a returning student
                </label>
              </div>
              <select
                className="w-full border border-border bg-background p-2 rounded"
                value={profileCompletionForm.cohort_id}
                onChange={(e) => setProfileCompletionForm(p => ({...p, cohort_id: e.target.value}))}
                disabled={loadingAllCohorts}
              >
                <option value="">
                  {loadingAllCohorts ? "Loading cohorts..." : "Select cohort"}
                </option>
                {(isReturningStudent ? allCohortOptions : cohortOptions)?.map(c => {
                  const isPast = isReturningStudent && c.is_active === false;
                  const yearRange = c.start_date && c.end_date 
                    ? `${new Date(c.start_date).getFullYear()}/${new Date(c.end_date).getFullYear().toString().slice(-2)}`
                    : null;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}{isPast ? ` (Past${yearRange ? ` - ${yearRange}` : ''})` : ''}
                    </option>
                  );
                })}
              </select>
              {isReturningStudent && (
                <p className="text-xs text-muted-foreground">
                  Showing all past and current cohorts. Your selection will still require admin approval.
                </p>
              )}
            </div>
            <Button className="w-full" onClick={() => setShowConfirmMode(true)} disabled={savingProfileCompletion}>
              {savingProfileCompletion ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Save and continue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmMode} onOpenChange={setShowConfirmMode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Profile Details</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to set your learning mode to <strong>{profileCompletionForm.learning_mode}</strong>? 
              This will be used for your initial enrollment and class assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveProfileCompletion}>Confirm and Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* Greeting. Name and status come from the auth context, which already
            has them — no reason to hold the greeting behind the stats fetch. */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] text-muted-foreground">
              {format(now, "EEEE · h:mm")} {format(now, "a").toLowerCase()}
              {admissionStatus && !isPending && (
                <>
                  {" · "}
                  <span className="font-semibold text-secondary-foreground">{admissionStatus}</span>
                </>
              )}
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {getGreeting()}, {firstName}
            </h1>
          </div>
          {/* The shell leaves its own bell off on this page; this is the one. */}
          <div className="shrink-0 [&>button]:h-11 [&>button]:w-11 [&>button]:rounded-full [&>button]:border [&>button]:border-border [&>button]:bg-card">
            <NotificationsBell />
          </div>
        </header>

        {/* A pending applicant's Today leads with where their application is. */}
        {isPending && (
          <ApplicationTracker
            firstName={firstName}
            email={profile?.email ?? null}
            detailsComplete={!!student?.cohort_id && isStudentProfileComplete(profile, student)}
            learningMode={student?.learning_mode ?? null}
            cohortName={cohortOptions.find((c) => c.id === cohortId)?.name ?? null}
          />
        )}

        {/* Two columns on a computer. When there is nothing to do (the first
            column renders empty and hides itself), the record takes the full
            width instead of leaving the narrow column blank, and its tiles go
            four across. */}
        <div className="group/dash grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:has-[>div:first-child:empty]:grid-cols-1">
          {/* What to do: next paper or class, today's timetable, tasks due.
              Hidden when all three are empty so the other column moves up. */}
          <div className="flex min-w-0 flex-col gap-4 empty:hidden">
            <UpNext plan={plan} />
            <TodayTimetable plan={plan} />
            {!loading && !isPending && dueSoon.length > 0 && (
              <section aria-labelledby="due-soon" className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <h2 id="due-soon" className="text-base font-bold text-foreground">
                    Due soon
                  </h2>
                  <Link to="/student/assignments" className="text-sm font-semibold text-primary hover:underline">
                    All tasks
                  </Link>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {dueSoon.map((task) => {
                    const badge = dueBadge(task.due_date);
                    return (
                      <li key={task.id}>
                        <Link
                          to="/student/assignments"
                          onMouseEnter={() => preloadPath("/student/assignments")}
                          onFocus={() => preloadPath("/student/assignments")}
                          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-[11px] font-extrabold text-primary"
                          >
                            TASK
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <strong className="truncate text-[15px]">{task.title}</strong>
                            <span className="text-[13px] text-muted-foreground">
                              {[task.courseCode, task.max_points != null ? `${task.max_points} points` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {badge && (
                            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${badge.className}`}>
                              {badge.text}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {/* The record at a glance. */}
            <section aria-label="Your record at a glance" className="grid grid-cols-2 gap-2.5 lg:group-has-[>div:first-child:empty]/dash:grid-cols-4">
              {tiles.map((tile) => (
                <Link
                  key={tile.label}
                  to={tile.path}
                  onMouseEnter={() => preloadPath(tile.path)}
                  onFocus={() => preloadPath(tile.path)}
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-3.5 text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-[13px] text-muted-foreground">{tile.label}</span>
                  {loading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <strong className="text-[22px] font-extrabold tracking-tight">{tile.value}</strong>
                  )}
                  {!loading && tile.note && (
                    <span className={`text-xs font-semibold ${tile.noteClass ?? "text-muted-foreground"}`}>{tile.note}</span>
                  )}
                  {!loading && tile.detail && <span className="text-xs text-muted-foreground">{tile.detail}</span>}
                </Link>
              ))}
            </section>

            {/* A summary of the figures above, so it sits after them rather
                than where it would look like the record itself. */}
            <ProgressSummary />

            {/* The dark "Ask Barnabas" card; opens the conversation. "Ask
                Barnabas" in the More sheet lands here with ?ask=1. */}
            <AssistantChat audience="student" openRequested={askRequested} onClose={clearAsk} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Announcements: the latest first, as on the board. */}
          <Reveal>
            <section aria-labelledby="dash-announcements" className="flex h-full flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <h2 id="dash-announcements" className="text-base font-bold text-foreground">
                  Announcements
                </h2>
                <Link to="/student/announcements" className="text-sm font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="space-y-2.5">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
              ) : data?.announcements && data.announcements.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {data.announcements.map((a, i) => (
                    <li key={i}>
                      <Link
                        to="/student/announcements"
                        className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5 text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${i === 0 ? "bg-primary" : "bg-border"}`}
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <strong className="text-sm">{a?.title}</strong>
                          <span className="line-clamp-2 text-[13px] text-muted-foreground">{a?.body}</span>
                          {a?.published_at && (
                            <span className="text-xs text-muted-foreground">
                              Announcement · {formatDistanceToNow(new Date(a.published_at), { addSuffix: true })}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No announcements at this time.
                </p>
              )}
            </section>
          </Reveal>

          {/* Upcoming events */}
          <Reveal delay={80}>
            <section aria-labelledby="dash-events" className="flex h-full flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <h2 id="dash-events" className="text-base font-bold text-foreground">
                  Upcoming events
                </h2>
                <Link to="/student/calendar" className="text-sm font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              {loading ? (
                <div className="space-y-2.5">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
              ) : data?.upcomingEvents && data.upcomingEvents.length > 0 ? (
                <ul className="overflow-hidden rounded-[18px] border border-border bg-card">
                  {data.upcomingEvents.map((ev, i) => (
                    <li key={ev.id} className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-border/60" : ""}`}>
                      <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary">
                        <span className="text-[10px] font-semibold uppercase text-secondary-foreground">
                          {new Date(ev.start_date).toLocaleDateString("en", { month: "short" })}
                        </span>
                        <span className="text-sm font-extrabold leading-none text-secondary-foreground">
                          {new Date(ev.start_date).getDate()}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <strong className="truncate text-sm text-foreground">{ev.title}</strong>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.start_date).toLocaleDateString("en", { weekday: "long" })}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${getCategoryColor(ev.category)}`}>
                        {ev.category || "General"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No upcoming events scheduled.
                </p>
              )}
            </section>
          </Reveal>
        </div>

        {/* Quick actions */}
        <Reveal>
          <section aria-labelledby="quick-actions" className="flex flex-col gap-2.5">
            <h2 id="quick-actions" className="text-base font-bold text-foreground">
              Quick actions
            </h2>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.label}
                  to={action.path}
                  onMouseEnter={() => preloadPath(action.path)}
                  onFocus={() => preloadPath(action.path)}
                  className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card p-2.5 text-center transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-secondary text-primary">
                    <action.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold text-foreground">{action.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Introduces the assistant by name and lists where he turns up.
            Renders nothing while every student-facing AI feature is off. */}
        <Reveal>
          <AssistantCard />
        </Reveal>
      </div>
    </>
  );
};

export default StudentDashboard;
