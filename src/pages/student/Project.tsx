import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Download, FileText, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DarkPanel, EmptyCard, Panel, Pill, ScreenHeader, SectionTitle } from "@/components/redesign/student-pages/ui";
import {
  PROJECT_FILE_ACCEPT,
  SUBMISSION_STATUS,
  TOPIC_STATUS,
  latestSubmission,
  outcomeLabel,
  projectFilePath,
  projectFileProblem,
  projectStep,
  topicProblem,
  type SubmissionStatus,
  type TopicStatus,
} from "@/lib/projects";
import { r2Storage } from "@/lib/r2-storage";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"project_overview">;
type Stage = Tables<"project_stages">;
type Submission = Tables<"project_submissions">;
type Archived = Tables<"project_archive">;

const openFile = async (path: string) => {
  try {
    window.open(await r2Storage.getDownloadUrl(path), "_blank", "noopener");
  } catch {
    toast.error("Could not open the file");
  }
};

/** Propose a topic, or send it again after changes were asked for. */
const TopicForm = ({ project, onSaved }: { project: Project | null; onSaved: () => void }) => {
  const [title, setTitle] = useState(project?.title ?? "");
  const [abstract, setAbstract] = useState(project?.abstract ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = topicProblem(title, abstract);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("submit_project_topic", { p_title: title.trim(), p_abstract: abstract.trim() });
    setSaving(false);
    if (error) {
      console.error("Submit topic error:", error);
      toast.error(error.message || "Could not send your topic");
      return;
    }
    toast.success("Topic sent for approval");
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="project-title">Project title</Label>
        <Input id="project-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project-abstract">What is it about?</Label>
        <Textarea
          id="project-abstract"
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          rows={6}
          maxLength={5000}
          aria-describedby="project-abstract-hint"
          required
        />
        <p id="project-abstract-hint" className="text-xs text-muted-foreground">
          A few sentences: the question you want to answer, why it matters, and how you plan to go about it.
        </p>
      </div>
      <Button type="submit" disabled={saving} className="h-11 font-bold">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {project ? "Send again for approval" : "Send for approval"}
      </Button>
    </form>
  );
};

/** One file upload with an optional note: a stage draft or the corrected copy. */
const HandIn = ({
  project,
  stageId,
  label,
  onDone,
}: {
  project: Project;
  stageId: string | null;
  label: string;
  onDone: () => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = `hand-in-${stageId ?? "correction"}`;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !project.id || !project.student_id) {
      toast.error("Choose a file first");
      return;
    }
    const problem = projectFileProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const path = await r2Storage.uploadFile(file, projectFilePath(project.student_id, project.id, file.name, Date.now()));
      const { error } = await supabase.from("project_submissions").insert({
        project_id: project.id,
        stage_id: stageId,
        kind: stageId ? "stage" : "correction",
        file_path: path,
        file_name: file.name,
        note: note.trim() || null,
      });
      if (error) throw error;
      toast.success("Handed in. You will be notified when there is feedback");
      setFile(null);
      setNote("");
      onDone();
    } catch (err) {
      console.error("Hand in error:", err);
      toast.error("Could not hand in the file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="mt-3 space-y-3 rounded-xl border border-dashed border-border p-3">
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{label} (PDF or Word, up to 25 MB)</Label>
        <Input id={inputId} type="file" accept={PROJECT_FILE_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${inputId}-note`}>Note to your supervisor (optional)</Label>
        <Textarea id={`${inputId}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      </div>
      <Button type="submit" disabled={busy || !file} className="h-10 gap-2 font-bold">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Hand in
      </Button>
    </form>
  );
};

/** Everything handed in for one stage, newest first, with the feedback on each. */
const History = ({ rows, onChanged }: { rows: Submission[]; onChanged: () => void }) => {
  const withdraw = async (row: Submission) => {
    const { error } = await supabase.from("project_submissions").delete().eq("id", row.id);
    if (error) {
      toast.error("Could not withdraw the file");
      return;
    }
    toast.success("File withdrawn");
    onChanged();
  };

  if (rows.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((row) => {
        const status = SUBMISSION_STATUS[row.status as SubmissionStatus] ?? SUBMISSION_STATUS.submitted;
        return (
          <li key={row.id} className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => openFile(row.file_path)}
                className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-primary underline-offset-2 hover:underline"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{row.file_name}</span>
              </button>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{format(new Date(row.submitted_at), "d MMM yyyy")}</span>
                <Pill tone={status.tone}>{status.label}</Pill>
                {row.status === "submitted" && (
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Withdraw ${row.file_name}`} onClick={() => withdraw(row)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </span>
            </div>
            {row.feedback && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                <span className="font-semibold">Feedback: </span>{row.feedback}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const PastProjects = () => {
  const [rows, setRows] = useState<Archived[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("project_archive")
      .select("*")
      .order("completed_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Load archive error:", error);
        setRows(data ?? []);
      });
  }, []);

  const needle = search.trim().toLowerCase();
  const shown = (rows ?? []).filter(
    (row) =>
      !needle ||
      [row.title, row.abstract, row.first_name, row.last_name, row.cohort_name].some((text) => text?.toLowerCase().includes(needle)),
  );

  if (rows === null) return <Skeleton className="h-24 w-full rounded-[20px]" />;
  if (rows.length === 0) {
    return (
      <EmptyCard icon={<FileText className="h-6 w-6" />} title="No completed projects yet">
        Projects appear here once they have been defended and passed.
      </EmptyCard>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, topic or name" aria-label="Search past projects" className="h-11 pl-9" />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No project matches that search.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((row) => (
            <Panel as="li" key={row.id}>
              <h3 className="text-base font-bold text-foreground">{row.title}</h3>
              <p className="text-xs text-muted-foreground">
                {[`${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(), row.cohort_name, row.completed_at && format(new Date(row.completed_at), "yyyy")]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {row.abstract && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-foreground">{row.abstract}</p>}
              {row.file_path && (
                <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => openFile(row.file_path!)}>
                  <Download className="h-4 w-4" /> Read the project
                </Button>
              )}
            </Panel>
          ))}
        </ul>
      )}
    </div>
  );
};

const StudentProject = () => {
  const { student } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!student?.id) {
      setLoading(false);
      return;
    }
    const { data: mine, error } = await supabase.from("project_overview").select("*").eq("student_id", student.id).maybeSingle();
    if (error) {
      console.error("Load project error:", error);
      toast.error("Could not load your project");
    }
    setProject(mine ?? null);
    const [stagesRes, subsRes] = await Promise.all([
      student.cohort_id
        ? supabase.from("project_stages").select("*").eq("cohort_id", student.cohort_id).order("position").order("due_date")
        : Promise.resolve({ data: [] as Stage[] }),
      mine?.id
        ? supabase.from("project_submissions").select("*").eq("project_id", mine.id).order("submitted_at", { ascending: false })
        : Promise.resolve({ data: [] as Submission[] }),
    ]);
    setStages(stagesRes.data ?? []);
    setSubmissions(subsRes.data ?? []);
    setLoading(false);
  }, [student?.id, student?.cohort_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const step = project ? projectStep(project) : null;
  const approved = project?.status === "approved";
  const outcome = outcomeLabel(project?.outcome);
  const corrections = useMemo(() => submissions.filter((row) => row.kind === "correction"), [submissions]);
  const needsCorrections = project?.outcome === "pass_with_corrections" && !project.final_approved_at;
  const awaitingCorrectionReview = latestSubmission(submissions, null)?.status === "submitted";

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Project"
        description="Your final project: topic, drafts, defence and result."
        aside={step ? <Pill tone={step.tone}>{step.label}</Pill> : undefined}
      />

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My project</TabsTrigger>
          <TabsTrigger value="past">Past projects</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-5">
          {loading ? (
            <Skeleton className="h-40 w-full rounded-[20px]" />
          ) : !project ? (
            <Panel>
              <SectionTitle>Propose your topic</SectionTitle>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Send the topic you would like to work on. If your supervisor gives you a topic instead, it will appear here and you
                will not need to fill this in.
              </p>
              <TopicForm project={null} onSaved={load} />
            </Panel>
          ) : (
            <>
              <DarkPanel>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={TOPIC_STATUS[project.status as TopicStatus]?.tone ?? "neutral"}>
                    Topic: {TOPIC_STATUS[project.status as TopicStatus]?.label ?? project.status}
                  </Pill>
                  {project.topic_source === "supervisor" && <Pill tone="info">Given by your supervisor</Pill>}
                </div>
                <h2 className="mt-3 text-xl font-extrabold leading-snug tracking-tight">{project.title}</h2>
                {project.abstract && <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">{project.abstract}</p>}
                <p className="mt-3 text-sm text-white/80">
                  Supervisor: <strong className="text-white">{project.supervisor_name ?? "Not assigned yet"}</strong>
                </p>
              </DarkPanel>

              {!approved && (
                <Panel>
                  <SectionTitle>
                    {project.status === "proposed" ? "Change your topic while you wait" : "Send your topic again"}
                  </SectionTitle>
                  {project.review_note && (
                    <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                      <span className="font-semibold">Note from staff: </span>{project.review_note}
                    </p>
                  )}
                  <div className="mt-4">
                    <TopicForm key={project.updated_at} project={project} onSaved={load} />
                  </div>
                </Panel>
              )}

              {approved && project.defence_at && (
                <Panel className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <CalendarClock className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <SectionTitle>Defence</SectionTitle>
                    <p className="text-sm text-foreground">{format(new Date(project.defence_at), "EEEE d MMMM yyyy, h:mm a")}</p>
                    {project.defence_venue && <p className="text-sm text-muted-foreground">{project.defence_venue}</p>}
                  </div>
                </Panel>
              )}

              {approved && outcome && (
                <Panel>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SectionTitle>Result</SectionTitle>
                    <Pill tone={outcome.tone}>{outcome.label}</Pill>
                  </div>
                  {project.final_score !== null && (
                    <p className="mt-1 text-3xl font-extrabold tracking-tight text-foreground">
                      {project.final_score}<span className="text-base font-semibold text-muted-foreground"> / 100</span>
                    </p>
                  )}
                  {project.outcome_note && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{project.outcome_note}</p>}
                  {project.outcome === "pass_with_corrections" && (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground">
                        {project.final_approved_at
                          ? "Your corrected copy has been approved. Your project is complete."
                          : "Make the corrections the panel asked for and upload the corrected copy."}
                      </p>
                      <History rows={corrections} onChanged={load} />
                      {needsCorrections && !awaitingCorrectionReview && (
                        <HandIn project={project} stageId={null} label="Corrected copy" onDone={load} />
                      )}
                    </div>
                  )}
                </Panel>
              )}

              {approved && (
                <section aria-labelledby="project-stages" className="space-y-3">
                  <SectionTitle id="project-stages">Stages</SectionTitle>
                  {stages.length === 0 ? (
                    <EmptyCard icon={<FileText className="h-6 w-6" />} title="No stages set yet">
                      The school has not set the stages for your cohort's projects. You will hand in your drafts here once it has.
                    </EmptyCard>
                  ) : (
                    <ol className="space-y-3">
                      {stages.map((stage, index) => {
                        const rows = submissions.filter((row) => row.kind === "stage" && row.stage_id === stage.id);
                        const latest = latestSubmission(submissions, stage.id);
                        const state = latest
                          ? SUBMISSION_STATUS[latest.status as SubmissionStatus] ?? SUBMISSION_STATUS.submitted
                          : { label: "Not handed in", tone: "neutral" as const };
                        const canHandIn =
                          (!project.outcome || project.outcome === "redefend") && (!latest || latest.status === "changes_requested");
                        return (
                          <Panel as="li" key={stage.id}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="text-base font-bold text-foreground">{index + 1}. {stage.title}</h3>
                                {stage.due_date && (
                                  <p className="text-sm text-muted-foreground">
                                    Due {format(new Date(`${stage.due_date}T00:00:00`), "d MMM yyyy")}
                                  </p>
                                )}
                                {stage.description && <p className="mt-1 text-sm text-foreground">{stage.description}</p>}
                              </div>
                              <Pill tone={state.tone}>{state.label}</Pill>
                            </div>
                            <History rows={rows} onChanged={load} />
                            {canHandIn && (
                              <HandIn project={project} stageId={stage.id} label={latest ? "Revised draft" : "Your draft"} onDone={load} />
                            )}
                          </Panel>
                        );
                      })}
                    </ol>
                  )}
                </section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          <PastProjects />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentProject;
