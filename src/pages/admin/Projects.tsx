import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageSkeleton } from "@/components/portal/PageSkeleton";
import { AdminPageHeader, KpiTile, Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { ADMIN_TONE, USUAL_RUBRIC, USUAL_STAGES, isProjectComplete, parseMembers, projectStep, rubricOutOf, stagesApproved } from "@/lib/projects";
import { Checkbox } from "@/components/ui/checkbox";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"project_overview">;
type Stage = Tables<"project_stages">;
type Criterion = Tables<"project_rubric_criteria">;
type Cohort = Pick<Tables<"cohorts">, "id" | "name" | "is_active">;
interface StudentOption { id: string; name: string; code: string | null }
interface StaffOption { id: string; name: string }

const FILTERS = [
  { value: "all", label: "All projects" },
  { value: "topics", label: "Topics to review" },
  { value: "mine", label: "I supervise" },
  { value: "defence", label: "Defence scheduled" },
  { value: "done", label: "Completed" },
] as const;

const AdminProjects = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [submissions, setSubmissions] = useState<Pick<Tables<"project_submissions">, "project_id" | "stage_id" | "kind" | "status" | "submitted_at">[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [loading, setLoading] = useState(true);

  const [giving, setGiving] = useState(false);
  const [give, setGive] = useState({ studentIds: [] as string[], title: "", abstract: "", supervisorId: "" });
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [newCriterion, setNewCriterion] = useState({ label: "", max: "" });
  const [saving, setSaving] = useState(false);
  const [newStage, setNewStage] = useState({ title: "", due: "" });

  const load = useCallback(async () => {
    const [projectsRes, cohortsRes, staffRes] = await Promise.all([
      supabase.from("project_overview").select("*").order("updated_at", { ascending: false }),
      supabase.from("cohorts").select("id, name, is_active").order("start_date", { ascending: false }),
      supabase.from("profiles").select("id, first_name, last_name").in("role", ["admin", "teacher"]).order("first_name"),
    ]);
    const failed = projectsRes.error ?? cohortsRes.error;
    if (failed) {
      console.error("Load projects error:", failed);
      toast.error("Could not load the projects");
    }
    setProjects(projectsRes.data ?? []);
    setCohorts(cohortsRes.data ?? []);
    setStaff((staffRes.data ?? []).map((p) => ({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed" })));
    setCohortId((current) => current || cohortsRes.data?.find((c) => c.is_active)?.id || cohortsRes.data?.[0]?.id || "");
    setLoading(false);
  }, []);

  const loadCohort = useCallback(async () => {
    if (!cohortId) return;
    const [stagesRes, rubricRes, studentsRes] = await Promise.all([
      supabase.from("project_stages").select("*").eq("cohort_id", cohortId).order("position").order("due_date"),
      supabase.from("project_rubric_criteria").select("*").eq("cohort_id", cohortId).order("position").order("created_at"),
      supabase
        .from("students")
        .select("id, student_code, admission_status, is_staff_preview, profile:profiles(first_name, last_name)")
        .eq("cohort_id", cohortId),
    ]);
    setStages(stagesRes.data ?? []);
    setCriteria(rubricRes.data ?? []);
    setStudents(
      (studentsRes.data ?? [])
        .filter((s) => !s.is_staff_preview && (s.admission_status ?? "").toUpperCase() !== "PENDING")
        .map((s) => ({
          id: s.id,
          code: s.student_code,
          name: [s.profile?.first_name, s.profile?.last_name].filter(Boolean).join(" ") || "Unnamed",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, [cohortId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadCohort();
  }, [loadCohort]);

  const inCohort = useMemo(() => projects.filter((p) => p.cohort_id === cohortId), [projects, cohortId]);

  useEffect(() => {
    const ids = inCohort.map((p) => p.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      setSubmissions([]);
      return;
    }
    supabase
      .from("project_submissions")
      .select("project_id, stage_id, kind, status, submitted_at")
      .in("project_id", ids)
      .then(({ data }) => setSubmissions(data ?? []));
  }, [inCohort]);

  const shown = inCohort.filter((p) => {
    switch (filter) {
      case "topics": return p.status === "proposed";
      case "mine": return p.supervisor_id === user?.id;
      case "defence": return Boolean(p.defence_at) && !p.outcome;
      case "done": return isProjectComplete(p);
      default: return true;
    }
  });

  // Everyone in a project, group members included.
  const withProject = new Set(inCohort.flatMap((p) => parseMembers(p.members).map((member) => member.student_id)));
  const without = students.filter((s) => !withProject.has(s.id));
  const toReview = submissions.filter((s) => s.status === "submitted").length;

  const giveTopic = async (event: React.FormEvent) => {
    event.preventDefault();
    const [leadId, ...others] = give.studentIds;
    if (!leadId || give.title.trim().length < 5) {
      toast.error("Choose at least one student and write the topic");
      return;
    }
    setSaving(true);
    const { data: created, error } = await supabase.from("projects").insert({
      student_id: leadId,
      is_group: others.length > 0,
      title: give.title.trim(),
      abstract: give.abstract.trim(),
      topic_source: "supervisor",
      status: "approved",
      supervisor_id: give.supervisorId || null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !created) {
      setSaving(false);
      console.error("Give topic error:", error);
      toast.error(error?.message?.includes("already in a project") ? "That student already has a project. Open it to change the topic" : "Could not save the topic");
      return;
    }
    if (others.length > 0) {
      const { error: membersError } = await supabase
        .from("project_members")
        .insert(others.map((student_id) => ({ project_id: created.id, student_id })));
      if (membersError) {
        console.error("Add group members error:", membersError);
        toast.error(`The topic was saved for the first student, but the others could not be added: ${membersError.message}`);
      }
    }
    setSaving(false);
    toast.success(others.length > 0 ? "Topic given. The group has been notified" : "Topic given. The student has been notified");
    setGiving(false);
    setGive({ studentIds: [], title: "", abstract: "", supervisorId: "" });
    void load();
  };

  const addStage = async (title: string, due: string, position: number) => {
    const { error } = await supabase.from("project_stages").insert({ cohort_id: cohortId, title: title.trim(), due_date: due || null, position });
    if (error) {
      console.error("Add stage error:", error);
      toast.error("Could not add the stage");
      return false;
    }
    return true;
  };

  const addUsual = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("project_stages")
      .insert(USUAL_STAGES.map((title, position) => ({ cohort_id: cohortId, title, position })));
    setSaving(false);
    if (error) toast.error("Could not add the stages");
    void loadCohort();
  };

  const updateStage = async (stage: Stage, patch: Partial<Stage>) => {
    const { error } = await supabase.from("project_stages").update(patch).eq("id", stage.id);
    if (error) toast.error("Could not save the stage");
    void loadCohort();
  };

  const removeStage = async (stage: Stage) => {
    if (submissions.some((s) => s.stage_id === stage.id)) {
      toast.error("Students have handed in work for this stage, so it cannot be removed");
      return;
    }
    const { error } = await supabase.from("project_stages").delete().eq("id", stage.id);
    if (error) toast.error("Could not remove the stage");
    void loadCohort();
  };

  const addUsualRubric = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("project_rubric_criteria")
      .insert(USUAL_RUBRIC.map((row, position) => ({ cohort_id: cohortId, ...row, position })));
    setSaving(false);
    if (error) toast.error("Could not add the rubric");
    void loadCohort();
  };

  const addCriterion = async (event: React.FormEvent) => {
    event.preventDefault();
    const max = Number(newCriterion.max);
    if (newCriterion.label.trim().length < 2 || !Number.isFinite(max) || max <= 0) {
      toast.error("Name the criterion and say how many marks it carries");
      return;
    }
    const { error } = await supabase
      .from("project_rubric_criteria")
      .insert({ cohort_id: cohortId, label: newCriterion.label.trim(), max_marks: max, position: criteria.length });
    if (error) {
      toast.error("Could not add the criterion");
      return;
    }
    setNewCriterion({ label: "", max: "" });
    void loadCohort();
  };

  const updateCriterion = async (criterion: Criterion, patch: Partial<Criterion>) => {
    const { error } = await supabase.from("project_rubric_criteria").update(patch).eq("id", criterion.id);
    if (error) toast.error("Could not save the criterion");
    void loadCohort();
  };

  const removeCriterion = async (criterion: Criterion) => {
    const { error } = await supabase.from("project_rubric_criteria").delete().eq("id", criterion.id);
    if (error) toast.error("Could not remove the criterion");
    void loadCohort();
  };

  if (loading) return <PageSkeleton stats={4} panels={2} />;

  return (
    <div className="space-y-5 pb-6">
      <AdminPageHeader
        section="Teaching"
        title="Projects"
        description="Final projects: topics, drafts, defence and results."
        actions={
          <>
            <Select value={cohortId} onValueChange={setCohortId}>
              <SelectTrigger className="h-10 w-52" aria-label="Cohort"><SelectValue placeholder="Cohort" /></SelectTrigger>
              <SelectContent>{cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="h-10 gap-2 font-bold" onClick={() => setGiving(true)}>
              <Plus className="h-4 w-4" /> Give a topic
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Topics to review" value={inCohort.filter((p) => p.status === "proposed").length} onClick={() => setFilter("topics")} pressed={filter === "topics"} />
        <KpiTile label="Drafts waiting for feedback" value={toReview} />
        <KpiTile label="Completed" value={inCohort.filter(isProjectComplete).length} onClick={() => setFilter("done")} pressed={filter === "done"} />
        <KpiTile label="Students with no project" value={without.length} note={without.length ? "Give them a topic, or wait for their proposal" : undefined} />
      </div>

      <Panel
        title="Projects"
        titleId="projects-list"
        actions={
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-9 w-48" aria-label="Show"><SelectValue /></SelectTrigger>
            <SelectContent>{FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        }
      >
        {shown.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            {inCohort.length === 0 ? "No student on this cohort has a project yet." : "No project matches this filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead><TableHead>Topic</TableHead><TableHead>Supervisor</TableHead>
                  <TableHead>Stages</TableHead><TableHead>Defence</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => {
                  const step = projectStep(p);
                  const mine = submissions.filter((s) => s.project_id === p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell title={p.member_names ?? undefined} className="whitespace-nowrap">
                        <span className="font-semibold">{[p.student_first_name, p.student_last_name].filter(Boolean).join(" ")}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.is_group ? `Group of ${parseMembers(p.members).length}` : p.student_code}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-64">
                        <Link to={`/admin/projects/${p.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">{p.title}</Link>
                        {p.topic_source === "supervisor" && <span className="block text-xs text-muted-foreground">Topic given by supervisor</span>}
                      </TableCell>
                      <TableCell>{p.supervisor_name ?? "Not assigned"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {stages.length ? `${stagesApproved(stages.map((s) => s.id), mine)} of ${stages.length} approved` : "No stages set"}
                        {mine.some((s) => s.status === "submitted") && <span className="block text-xs font-semibold text-amber-800 dark:text-amber-300">Draft waiting</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{p.defence_at ? format(new Date(p.defence_at), "d MMM yyyy, h:mm a") : "Not scheduled"}</TableCell>
                      <TableCell><StatusPill tone={ADMIN_TONE[step.tone]}>{step.label}</StatusPill></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel title="Stages for this cohort" titleId="project-stages" description="What each student hands in, in order. Students see these with the due dates.">
        <div className="space-y-3 p-5">
          {stages.length === 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">No stages yet.</p>
              <Button variant="outline" size="sm" disabled={saving || !cohortId} onClick={addUsual}>
                Add the usual four ({USUAL_STAGES.join(", ")})
              </Button>
            </div>
          )}
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor={`stage-title-${stage.id}`}>Stage {index + 1}</Label>
                <Input
                  id={`stage-title-${stage.id}`}
                  defaultValue={stage.title}
                  maxLength={120}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== stage.title && updateStage(stage, { title: e.target.value.trim() })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`stage-due-${stage.id}`}>Due</Label>
                <Input
                  id={`stage-due-${stage.id}`}
                  type="date"
                  defaultValue={stage.due_date ?? ""}
                  onBlur={(e) => (e.target.value || null) !== stage.due_date && updateStage(stage, { due_date: e.target.value || null })}
                />
              </div>
              <Button variant="ghost" size="icon" aria-label={`Remove ${stage.title}`} onClick={() => removeStage(stage)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (newStage.title.trim().length < 2 || !cohortId) return;
              if (await addStage(newStage.title, newStage.due, stages.length)) {
                setNewStage({ title: "", due: "" });
                void loadCohort();
              }
            }}
          >
            <div className="min-w-48 flex-1 space-y-1">
              <Label htmlFor="new-stage-title">New stage</Label>
              <Input id="new-stage-title" value={newStage.title} maxLength={120} onChange={(e) => setNewStage((s) => ({ ...s, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-stage-due">Due</Label>
              <Input id="new-stage-due" type="date" value={newStage.due} onChange={(e) => setNewStage((s) => ({ ...s, due: e.target.value }))} />
            </div>
            <Button type="submit" variant="outline" disabled={newStage.title.trim().length < 2}>Add stage</Button>
          </form>
        </div>
      </Panel>

      <Panel
        title="Defence rubric for this cohort"
        titleId="project-rubric"
        description={`What the panel scores each defence on. Marked out of ${rubricOutOf(criteria.map((c) => ({ ...c, max_marks: Number(c.max_marks) })))} in total; a project's score is shown as a percentage. Changing this does not alter scores already entered.`}
      >
        <div className="space-y-3 p-5">
          {criteria.length === 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">No rubric yet. The panel cannot enter scores until there is one.</p>
              <Button variant="outline" size="sm" disabled={saving || !cohortId} onClick={addUsualRubric}>
                Start from a common rubric (5 criteria, 100 marks)
              </Button>
            </div>
          )}
          {criteria.map((criterion, index) => (
            <div key={criterion.id} className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1 space-y-1">
                <Label htmlFor={`criterion-label-${criterion.id}`}>Criterion {index + 1}</Label>
                <Input
                  id={`criterion-label-${criterion.id}`}
                  defaultValue={criterion.label}
                  maxLength={160}
                  onBlur={(e) => e.target.value.trim().length >= 2 && e.target.value.trim() !== criterion.label && updateCriterion(criterion, { label: e.target.value.trim() })}
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor={`criterion-max-${criterion.id}`}>Marks</Label>
                <Input
                  id={`criterion-max-${criterion.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0.5"
                  step="0.5"
                  defaultValue={Number(criterion.max_marks)}
                  onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(criterion.max_marks) && updateCriterion(criterion, { max_marks: Number(e.target.value) })}
                />
              </div>
              <Button variant="ghost" size="icon" aria-label={`Remove ${criterion.label}`} onClick={() => removeCriterion(criterion)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <form className="flex flex-wrap items-end gap-2 border-t border-border pt-3" onSubmit={addCriterion}>
            <div className="min-w-56 flex-1 space-y-1">
              <Label htmlFor="new-criterion-label">New criterion</Label>
              <Input id="new-criterion-label" value={newCriterion.label} maxLength={160} onChange={(e) => setNewCriterion((c) => ({ ...c, label: e.target.value }))} />
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor="new-criterion-max">Marks</Label>
              <Input id="new-criterion-max" type="number" inputMode="decimal" min="0.5" step="0.5" value={newCriterion.max} onChange={(e) => setNewCriterion((c) => ({ ...c, max: e.target.value }))} />
            </div>
            <Button type="submit" variant="outline" disabled={!cohortId}>Add criterion</Button>
          </form>
        </div>
      </Panel>

      <Dialog open={giving} onOpenChange={setGiving}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Give a topic</DialogTitle>
            <DialogDescription>
              Tick one student for an individual project, or several for a group project. The topic is approved straight away and
              they are notified. Only students with no project are listed.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={giveTopic} className="space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">
                {give.studentIds.length > 1 ? `Group of ${give.studentIds.length}` : "Student or students"}
              </legend>
              {without.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every student on this cohort already has a project.</p>
              ) : (
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {without.map((st) => (
                    <label key={st.id} className="flex min-h-9 items-center gap-2 rounded px-1 text-sm hover:bg-muted/60">
                      <Checkbox
                        checked={give.studentIds.includes(st.id)}
                        onCheckedChange={(checked) =>
                          setGive((g) => ({
                            ...g,
                            studentIds: checked === true ? [...g.studentIds, st.id] : g.studentIds.filter((x) => x !== st.id),
                          }))
                        }
                      />
                      {st.name}{st.code ? ` (${st.code})` : ""}
                      {give.studentIds.length > 1 && give.studentIds[0] === st.id && <span className="text-xs text-muted-foreground">lead</span>}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="give-title">Topic</Label>
              <Input id="give-title" value={give.title} maxLength={300} required onChange={(e) => setGive((g) => ({ ...g, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="give-abstract">Guidance for the student (optional)</Label>
              <Textarea id="give-abstract" rows={4} maxLength={5000} value={give.abstract} onChange={(e) => setGive((g) => ({ ...g, abstract: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="give-supervisor">Supervisor</Label>
              <Select value={give.supervisorId || "none"} onValueChange={(v) => setGive((g) => ({ ...g, supervisorId: v === "none" ? "" : v }))}>
                <SelectTrigger id="give-supervisor"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Assign later</SelectItem>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.id === user?.id ? " (me)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="font-bold">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Give topic
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProjects;
