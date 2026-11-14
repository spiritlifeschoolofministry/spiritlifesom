import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Loader2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/portal/PageHeader";
import { PageSkeleton } from "@/components/portal/PageSkeleton";
import { Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { APPROVE_BUTTON, REJECT_BUTTON } from "@/components/redesign/admin/styles";
import {
  ADMIN_TONE,
  SCORING_MODES,
  averagePercent,
  combineScores,
  scoreTargets,
  OUTCOMES,
  SUBMISSION_STATUS,
  TOPIC_STATUS,
  formatPercent,
  fromLocalInput,
  parseMembers,
  parseRubricScores,
  projectStep,
  rubricOutOf,
  rubricProblem,
  rubricTotal,
  toLocalInput,
  type RubricCriterion,
  type RubricScores,
  type SubmissionStatus,
  type TopicStatus,
} from "@/lib/projects";
import { r2Storage } from "@/lib/r2-storage";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"project_overview">;
type Stage = Tables<"project_stages">;
type Submission = Tables<"project_submissions">;
type Score = Tables<"project_scores">;
interface StaffOption { id: string; name: string }

const openFile = async (path: string) => {
  try {
    window.open(await r2Storage.getDownloadUrl(path), "_blank", "noopener");
  } catch {
    toast.error("Could not open the file");
  }
};

/** One handed-in file with the box to approve it or ask for changes. */
const SubmissionReview = ({ row, userId, onDone }: { row: Submission; userId: string | null; onDone: () => void }) => {
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const status = SUBMISSION_STATUS[row.status as SubmissionStatus] ?? SUBMISSION_STATUS.submitted;

  const decide = async (next: "approved" | "changes_requested") => {
    if (next === "changes_requested" && !feedback.trim()) {
      toast.error("Say what needs to change");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("project_submissions")
      .update({ status: next, feedback: feedback.trim() || null, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusy(false);
    if (error) {
      console.error("Review submission error:", error);
      toast.error("Could not save your feedback");
      return;
    }
    toast.success(next === "approved" ? "Approved. The student has been notified" : "Sent back with your feedback");
    onDone();
  };

  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => openFile(row.file_path)} className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-primary underline-offset-2 hover:underline">
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{row.file_name}</span>
        </button>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{format(new Date(row.submitted_at), "d MMM yyyy, h:mm a")}</span>
          <StatusPill tone={ADMIN_TONE[status.tone]}>{status.label}</StatusPill>
        </span>
      </div>
      {row.note && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Student's note: </span>{row.note}</p>}
      <div className="space-y-1.5">
        <Label htmlFor={`feedback-${row.id}`}>Feedback to the student</Label>
        <Textarea id={`feedback-${row.id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} maxLength={5000} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={APPROVE_BUTTON} disabled={busy} onClick={() => decide("approved")}>
          {row.status === "approved" ? "Save feedback" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" className={REJECT_BUTTON} disabled={busy} onClick={() => decide("changes_requested")}>
          Ask for changes
        </Button>
      </div>
    </li>
  );
};

/** The rubric form for one panel member. */
const ScoreForm = ({
  projectId,
  criteria,
  memberId,
  studentId,
  memberName,
  existing,
  onSaved,
}: {
  projectId: string;
  criteria: RubricCriterion[];
  memberId: string;
  /** The member being scored, or null for the group score. */
  studentId: string | null;
  memberName: string;
  existing: Score | undefined;
  onSaved: () => void;
}) => {
  const [marks, setMarks] = useState<Record<string, string>>(() => {
    const saved = parseRubricScores(criteria, existing?.scores);
    return Object.fromEntries(criteria.map((c) => [c.id, saved[c.id] !== undefined ? String(saved[c.id]) : ""]));
  });
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false);

  const scores: RubricScores = Object.fromEntries(
    criteria.filter((c) => (marks[c.id] ?? "") !== "").map((c) => [c.id, Number(marks[c.id])]),
  );

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = rubricProblem(criteria, scores);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    // The database works out the total and what it is out of from the rubric.
    const { error } = await supabase.rpc("save_project_score", {
      p_project_id: projectId,
      p_member_id: memberId,
      p_student_id: studentId as string,
      p_scores: scores,
      p_comment: comment.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      console.error("Save score error:", error);
      toast.error(error.message || "Could not save the score");
      return;
    }
    toast.success(`Saved: ${memberName}`);
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-border p-3">
      <h3 className="text-sm font-bold">{memberName}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {criteria.map((criterion) => (
          <div key={criterion.id} className="space-y-1">
            <Label htmlFor={`${memberId}-${studentId ?? "group"}-${criterion.id}`}>{criterion.label} (out of {Number(criterion.max_marks)})</Label>
            <Input
              id={`${memberId}-${studentId ?? "group"}-${criterion.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              max={Number(criterion.max_marks)}
              step="0.5"
              value={marks[criterion.id] ?? ""}
              onChange={(e) => setMarks((m) => ({ ...m, [criterion.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${memberId}-${studentId ?? "group"}-comment`}>Comment (optional)</Label>
        <Textarea id={`${memberId}-${studentId ?? "group"}-comment`} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={2000} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save score
        </Button>
        <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{rubricTotal(criteria, scores)}</strong> / {rubricOutOf(criteria)}</span>
      </div>
    </form>
  );
};

const AdminProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const isAdmin = (role ?? "").toLowerCase() === "admin";
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [panel, setPanel] = useState<string[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [cohortStudents, setCohortStudents] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [addingMember, setAddingMember] = useState("");
  const [scoringAs, setScoringAs] = useState("");
  const [weightDraft, setWeightDraft] = useState("50");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [topic, setTopic] = useState({ title: "", abstract: "", note: "" });
  const [defence, setDefence] = useState({ at: "", venue: "" });
  const [result, setResult] = useState({ outcome: "", note: "" });

  const load = useCallback(async () => {
    if (!id) return;
    const { data: row, error } = await supabase.from("project_overview").select("*").eq("id", id).maybeSingle();
    if (error) console.error("Load project error:", error);
    setProject(row ?? null);
    if (row) {
      setTopic({ title: row.title ?? "", abstract: row.abstract ?? "", note: row.review_note ?? "" });
      setDefence({ at: toLocalInput(row.defence_at), venue: row.defence_venue ?? "" });
      setResult({ outcome: row.outcome ?? "", note: row.outcome_note ?? "" });
      setWeightDraft(String(Number(row.individual_weight ?? 50)));
      const [stagesRes, subsRes, staffRes, panelRes, scoresRes, rubricRes, studentsRes, takenRes] = await Promise.all([
        row.cohort_id
          ? supabase.from("project_stages").select("*").eq("cohort_id", row.cohort_id).order("position").order("due_date")
          : Promise.resolve({ data: [] as Stage[] }),
        supabase.from("project_submissions").select("*").eq("project_id", id).order("submitted_at", { ascending: false }),
        supabase.from("profiles").select("id, first_name, last_name").in("role", ["admin", "teacher"]).order("first_name"),
        supabase.from("project_panel").select("member_id").eq("project_id", id),
        supabase.from("project_scores").select("*").eq("project_id", id),
        row.cohort_id
          ? supabase.from("project_rubric_criteria").select("id, label, max_marks").eq("cohort_id", row.cohort_id).order("position").order("created_at")
          : Promise.resolve({ data: [] as RubricCriterion[] }),
        row.cohort_id
          ? supabase
              .from("students")
              .select("id, student_code, admission_status, is_staff_preview, profile:profiles(first_name, last_name)")
              .eq("cohort_id", row.cohort_id)
          : Promise.resolve({ data: [] }),
        supabase.from("project_members").select("student_id").eq("active", true),
      ]);
      setCriteria(rubricRes.data ?? []);
      setCohortStudents(
        (studentsRes.data ?? [])
          .filter((st) => !st.is_staff_preview && (st.admission_status ?? "").toUpperCase() !== "PENDING")
          .map((st) => ({
            id: st.id,
            code: st.student_code,
            name: [st.profile?.first_name, st.profile?.last_name].filter(Boolean).join(" ") || "Unnamed",
          }))
          .sort((x, y) => x.name.localeCompare(y.name)),
      );
      setTaken(new Set((takenRes.data ?? []).map((m) => m.student_id)));
      setStages(stagesRes.data ?? []);
      setSubmissions(subsRes.data ?? []);
      setStaff((staffRes.data ?? []).map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed" })));
      setPanel((panelRes.data ?? []).map((m) => m.member_id));
      setScores(scoresRes.data ?? []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Saves columns on the project, reports, reloads. */
  const patch = async (values: Partial<Tables<"projects">>, done: string) => {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from("projects").update(values).eq("id", id);
    setBusy(false);
    if (error) {
      console.error("Update project error:", error);
      toast.error("Could not save");
      return;
    }
    toast.success(done);
    void load();
  };

  const decideTopic = (status: TopicStatus) => {
    if (status !== "approved" && !topic.note.trim()) {
      toast.error("Write a note so the student knows why");
      return;
    }
    void patch(
      { status, review_note: topic.note.trim() || null, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() },
      status === "approved" ? "Topic approved. The student has been notified" : "Decision saved. The student has been notified",
    );
  };

  const saveTopicText = () => {
    if (topic.title.trim().length < 5) {
      toast.error("Write the topic");
      return;
    }
    void patch(
      { title: topic.title.trim(), abstract: topic.abstract.trim(), topic_source: "supervisor", status: "approved", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() },
      "Topic changed and approved",
    );
  };

  const addMember = async () => {
    if (!id || !addingMember) return;
    setBusy(true);
    // A second member makes it a group project; the flag goes first because the
    // database refuses a second member on an individual one.
    const flagged = project?.is_group ? { error: null } : await supabase.from("projects").update({ is_group: true }).eq("id", id);
    const { error } = flagged.error ? flagged : await supabase.from("project_members").insert({ project_id: id, student_id: addingMember });
    setBusy(false);
    if (error) {
      console.error("Add member error:", error);
      toast.error(error.message || "Could not add the student");
      return;
    }
    setAddingMember("");
    toast.success("Added to the project. They have been notified");
    void load();
  };

  const removeMember = async (studentId: string, remaining: number) => {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from("project_members").delete().eq("project_id", id).eq("student_id", studentId);
    // Down to the lead alone, it is an individual project again.
    if (!error && remaining === 1) await supabase.from("projects").update({ is_group: false }).eq("id", id);
    setBusy(false);
    if (error) {
      console.error("Remove member error:", error);
      toast.error(error.message || "Could not remove the student");
      return;
    }
    toast.success("Removed from the project");
    void load();
  };

  const deleteProject = async () => {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_project", { p_project_id: id });
    setBusy(false);
    setConfirmDelete(false);
    if (error) {
      console.error("Delete project error:", error);
      toast.error(error.message || "Could not delete the project");
      return;
    }
    toast.success("Project moved to the bin. It can be restored for 30 days");
    navigate("/admin/projects");
  };

  const togglePanel = async (memberId: string, on: boolean) => {
    if (!id) return;
    if (!on && scores.some((s) => s.member_id === memberId) && !window.confirm("This member has entered scores. Removing them from the panel deletes those scores. Remove?")) return;
    const { error } = on
      ? await supabase.from("project_panel").insert({ project_id: id, member_id: memberId })
      : await supabase.from("project_panel").delete().eq("project_id", id).eq("member_id", memberId);
    if (error) {
      console.error("Panel error:", error);
      toast.error("Could not change the panel");
      return;
    }
    void load();
  };

  if (loading) return <PageSkeleton panels={3} />;
  if (!project) {
    return (
      <div className="space-y-4">
        <PageHeader title="Project not found" backTo="/admin/projects" breadcrumbs={[{ label: "Projects", to: "/admin/projects" }]} />
        <p className="text-sm text-muted-foreground">It may have been removed, or the link is wrong.</p>
      </div>
    );
  }

  const step = projectStep(project);
  const members = parseMembers(project.members);
  const studentName = project.member_names || [project.student_first_name, project.student_last_name].filter(Boolean).join(" ");
  const addable = cohortStudents.filter((st) => !taken.has(st.id));
  const approved = project.status === "approved";
  const topicStatus = TOPIC_STATUS[project.status as TopicStatus] ?? TOPIC_STATUS.proposed;
  const staffName = (memberId: string) => staff.find((s) => s.id === memberId)?.name ?? "Unknown";
  // A member scores for themselves; an admin may enter anyone's.
  const scorable = panel.filter((memberId) => memberId === user?.id || isAdmin);
  const scorer = scorable.includes(scoringAs) ? scoringAs : scorable.includes(user?.id ?? "") ? (user?.id as string) : scorable[0] ?? "";
  const mode = project.scoring_mode ?? "group";
  const targets = scoreTargets(mode);
  const individualWeight = Number(project.individual_weight ?? 50);
  const groupScores = scores.filter((s) => s.student_id === null);
  const groupPercent = averagePercent(groupScores);
  const findScore = (memberId: string, studentId: string | null) =>
    scores.find((s) => s.member_id === memberId && s.student_id === studentId);
  const corrections = submissions.filter((row) => row.kind === "correction");

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        title={studentName || "Project"}
        backTo="/admin/projects"
        breadcrumbs={[{ label: "Projects", to: "/admin/projects" }]}
        actions={
          isAdmin ? (
            <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete project
            </Button>
          ) : undefined
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {[project.is_group ? `Group project, ${members.length} members` : project.student_code, project.cohort_name].filter(Boolean).join(" · ")}
            <StatusPill tone={ADMIN_TONE[step.tone]}>{step.label}</StatusPill>
          </span>
        }
      />

      <Panel
        title={project.is_group ? "Group members" : "Student"}
        titleId="project-members"
        description={
          project.members_locked
            ? "Set by the school: the students cannot change who is in this group. Every member can hand in work and gets the same feedback, defence and result."
            : "Every member can hand in work and gets the same feedback, defence and result. Add a student to make this a group project."
        }
      >
        <div className="space-y-3 p-5">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {members.map((member) => (
              <li key={member.student_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{member.name}</span>
                  {member.code && <span className="text-muted-foreground"> · {member.code}</span>}
                  {member.lead && project.is_group && <span className="text-muted-foreground"> · lead</span>}
                </span>
                {!member.lead && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => removeMember(member.student_id, members.length - 1)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="add-member">Add a student from this cohort</Label>
              <Select value={addingMember} onValueChange={setAddingMember}>
                <SelectTrigger id="add-member">
                  <SelectValue placeholder={addable.length ? "Choose a student" : "Every student is already in a project"} />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((st) => <SelectItem key={st.id} value={st.id}>{st.name}{st.code ? ` (${st.code})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={busy || !addingMember} onClick={addMember}>Add to project</Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Topic"
        titleId="project-topic"
        description={
          project.status === "awaiting_topic"
            ? "Waiting for the group to send one"
            : project.topic_source === "supervisor" ? "Given by the supervisor" : project.is_group ? "Proposed by the group" : "Proposed by the student"
        }
        actions={<StatusPill tone={ADMIN_TONE[topicStatus.tone]}>{topicStatus.label}</StatusPill>}
      >
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="topic-title">Title</Label>
            <Input id="topic-title" value={topic.title} maxLength={300} onChange={(e) => setTopic((t) => ({ ...t, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic-abstract">Description</Label>
            <Textarea id="topic-abstract" value={topic.abstract} rows={5} maxLength={5000} onChange={(e) => setTopic((t) => ({ ...t, abstract: e.target.value }))} />
          </div>
          {(topic.title.trim() !== (project.title ?? "") || topic.abstract.trim() !== (project.abstract ?? "").trim()) && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={busy} onClick={saveTopicText}>Give this topic instead</Button>
              <span className="text-sm text-muted-foreground">Saves your wording as the approved topic, marked as given by the supervisor.</span>
            </div>
          )}
          {project.status === "awaiting_topic" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              This group has not sent a topic yet. The lead can send one from their Project page, or write one above and choose
              "Give this topic instead".
            </p>
          )}
          {!approved && project.status !== "awaiting_topic" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="topic-note">Note to the student</Label>
                <Textarea id="topic-note" value={topic.note} rows={3} maxLength={2000} onChange={(e) => setTopic((t) => ({ ...t, note: e.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className={APPROVE_BUTTON} disabled={busy} onClick={() => decideTopic("approved")}>Approve topic</Button>
                <Button variant="outline" disabled={busy} onClick={() => decideTopic("changes_requested")}>Ask for changes</Button>
                <Button variant="outline" className={REJECT_BUTTON} disabled={busy} onClick={() => decideTopic("rejected")}>Reject</Button>
              </div>
            </>
          )}
          <div className="max-w-sm space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="project-supervisor">Supervisor</Label>
            <Select
              value={project.supervisor_id ?? "none"}
              onValueChange={(v) => patch({ supervisor_id: v === "none" ? null : v }, v === "none" ? "Supervisor removed" : "Supervisor assigned")}
            >
              <SelectTrigger id="project-supervisor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not assigned</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.id === user?.id ? " (me)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Panel>

      {approved && (
        <Panel title="Drafts" titleId="project-drafts" description="Newest first within each stage. The student is notified of each decision.">
          <div className="space-y-5 p-5">
            {stages.length === 0 && <p className="text-sm text-muted-foreground">This cohort has no stages yet. Add them on the Projects page.</p>}
            {stages.map((stage, index) => {
              const rows = submissions.filter((row) => row.kind === "stage" && row.stage_id === stage.id);
              return (
                <div key={stage.id}>
                  <h3 className="text-sm font-bold">
                    {index + 1}. {stage.title}
                    {stage.due_date && <span className="font-normal text-muted-foreground"> · due {format(new Date(`${stage.due_date}T00:00:00`), "d MMM yyyy")}</span>}
                  </h3>
                  {rows.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">Nothing handed in.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {rows.map((row) => <SubmissionReview key={`${row.id}-${row.status}`} row={row} userId={user?.id ?? null} onDone={load} />)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {approved && (
        <Panel title="Defence" titleId="project-defence" description="The student and the panel are notified when this is set or moved, and reminded the day before.">
          <div className="space-y-5 p-5">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void patch({ defence_at: fromLocalInput(defence.at), defence_venue: defence.venue.trim() || null }, defence.at ? "Defence saved" : "Defence cleared");
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="defence-at">Date and time</Label>
                <Input id="defence-at" type="datetime-local" value={defence.at} onChange={(e) => setDefence((d) => ({ ...d, at: e.target.value }))} />
              </div>
              <div className="min-w-56 flex-1 space-y-1.5">
                <Label htmlFor="defence-venue">Venue or meeting link</Label>
                <Input id="defence-venue" value={defence.venue} maxLength={300} onChange={(e) => setDefence((d) => ({ ...d, venue: e.target.value }))} />
              </div>
              <Button type="submit" variant="outline" disabled={busy}>Save defence</Button>
            </form>

            <fieldset>
              <legend className="text-sm font-bold">Panel</legend>
              <p className="text-sm text-muted-foreground">Each member enters their own score. Set the panel before saving the date so they are told.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {staff.map((member) => (
                  <label key={member.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                    <Checkbox checked={panel.includes(member.id)} onCheckedChange={(checked) => togglePanel(member.id, checked === true)} />
                    {member.name}{member.id === user?.id ? " (me)" : ""}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="scoring-mode">How this project is scored</Label>
                <Select value={mode} onValueChange={(value) => patch({ scoring_mode: value }, "Scoring changed. Results have been worked out again")}>
                  <SelectTrigger id="scoring-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCORING_MODES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{SCORING_MODES.find((option) => option.value === mode)?.hint}</p>
              </div>
              {mode === "both" && (
                <form
                  className="space-y-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = Number(weightDraft);
                    if (!Number.isFinite(value) || value < 0 || value > 100) {
                      toast.error("Enter a percentage from 0 to 100");
                      return;
                    }
                    void patch({ individual_weight: value }, "Weight saved. Results have been worked out again");
                  }}
                >
                  <Label htmlFor="individual-weight">Individual score counts for (%)</Label>
                  <div className="flex gap-2">
                    <Input id="individual-weight" type="number" inputMode="decimal" min="0" max="100" step="1" className="w-28" value={weightDraft} onChange={(e) => setWeightDraft(e.target.value)} />
                    <Button type="submit" variant="outline" disabled={busy}>Save</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The group score counts for the other {100 - individualWeight}%.
                  </p>
                </form>
              )}
            </div>

            {panel.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold">
                    Results
                    <span className="font-normal text-muted-foreground">
                      {project.final_score !== null ? ` · project average ${formatPercent(project.final_score)}` : ""}
                    </span>
                  </h3>
                  <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-semibold">Student</th>
                          {targets.group && <th scope="col" className="px-3 py-2 font-semibold">Group score</th>}
                          {targets.individual && <th scope="col" className="px-3 py-2 font-semibold">Individual score</th>}
                          <th scope="col" className="px-3 py-2 font-semibold">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {members.map((member) => {
                          const own = averagePercent(scores.filter((s) => s.student_id === member.student_id));
                          const ownCount = scores.filter((s) => s.student_id === member.student_id).length;
                          const result = member.score ?? combineScores(mode, groupPercent, own, individualWeight);
                          return (
                            <tr key={member.student_id}>
                              <th scope="row" className="px-3 py-2 text-left font-medium">{member.name}</th>
                              {targets.group && (
                                <td className="px-3 py-2">
                                  {groupPercent !== null ? formatPercent(groupPercent) : "Not entered"}
                                  <span className="text-xs text-muted-foreground"> ({groupScores.length} of {panel.length})</span>
                                </td>
                              )}
                              {targets.individual && (
                                <td className="px-3 py-2">
                                  {own !== null ? formatPercent(own) : "Not entered"}
                                  <span className="text-xs text-muted-foreground"> ({ownCount} of {panel.length})</span>
                                </td>
                              )}
                              <td className="px-3 py-2 font-bold">{result !== null ? formatPercent(result) : "Waiting for scores"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">In brackets: how many of the panel have entered that score.</p>
                </div>

                {criteria.length === 0 && (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                    This cohort has no scoring rubric yet. Set it on the Projects page before the panel scores.
                  </p>
                )}

                {criteria.length > 0 && scorer && (
                  <div className="space-y-3">
                    {scorable.length > 1 && (
                      <div className="max-w-sm space-y-1.5">
                        <Label htmlFor="scoring-as">Entering scores for panel member</Label>
                        <Select value={scorer} onValueChange={setScoringAs}>
                          <SelectTrigger id="scoring-as"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {scorable.map((memberId) => (
                              <SelectItem key={memberId} value={memberId}>{staffName(memberId)}{memberId === user?.id ? " (me)" : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {targets.group && (
                      <ScoreForm
                        key={`${scorer}-group-${findScore(scorer, null)?.updated_at ?? "new"}`}
                        projectId={project.id!}
                        criteria={criteria}
                        memberId={scorer}
                        studentId={null}
                        memberName={members.length > 1 ? "Group score" : "Score"}
                        existing={findScore(scorer, null)}
                        onSaved={load}
                      />
                    )}
                    {targets.individual && members.map((member) => (
                      <ScoreForm
                        key={`${scorer}-${member.student_id}-${findScore(scorer, member.student_id)?.updated_at ?? "new"}`}
                        projectId={project.id!}
                        criteria={criteria}
                        memberId={scorer}
                        studentId={member.student_id}
                        memberName={`Individual score: ${member.name}`}
                        existing={findScore(scorer, member.student_id)}
                        onSaved={load}
                      />
                    ))}
                  </div>
                )}
                {criteria.length > 0 && !scorer && (
                  <p className="text-sm text-muted-foreground">Only panel members enter scores. You are not on this panel.</p>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}

      {approved && (
        <Panel title="Result" titleId="project-result" description="Each student sees the outcome, their own score as a percentage and your note. The outcome is shared by the group; the score is too unless individuals are scored.">
          <div className="space-y-4 p-5">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void patch({ outcome: result.outcome || null, outcome_note: result.note.trim() || null }, result.outcome ? "Result saved. The student has been notified" : "Result cleared");
              }}
            >
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="project-outcome">Outcome</Label>
                <Select value={result.outcome || "none"} onValueChange={(v) => setResult((r) => ({ ...r, outcome: v === "none" ? "" : v }))}>
                  <SelectTrigger id="project-outcome"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No result yet</SelectItem>
                    {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-outcome-note">Note to the student (for example, the corrections to make)</Label>
                <Textarea id="project-outcome-note" value={result.note} rows={3} maxLength={2000} onChange={(e) => setResult((r) => ({ ...r, note: e.target.value }))} />
              </div>
              <Button type="submit" disabled={busy}>Save result</Button>
            </form>

            {project.outcome === "pass_with_corrections" && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-bold">
                  Corrected copy
                  {project.final_approved_at && <span className="font-normal text-muted-foreground"> · approved {format(new Date(project.final_approved_at), "d MMM yyyy")}</span>}
                </h3>
                {corrections.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">The student has not uploaded it yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {corrections.map((row) => <SubmissionReview key={`${row.id}-${row.status}`} row={row} userId={user?.id ?? null} onDone={load} />)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this project?"
        description={
          <>
            It goes to the bin on the Projects page and can be restored for 30 days; after that it is removed for good.{" "}
            {members.length > 1 ? "The students in it are" : "The student is"} told, and can start a new project straight away.
          </>
        }
        confirmLabel="Move to bin"
        variant="destructive"
        loading={busy}
        onConfirm={deleteProject}
      />
    </div>
  );
};

export default AdminProjectDetail;
