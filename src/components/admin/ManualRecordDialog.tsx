import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, ClipboardPen, Search } from "lucide-react";
import { toast } from "sonner";

export const RECORD_CATEGORIES = [
  "Assignment",
  "Exam",
  "Project",
  "Class Work",
  "Group Activity",
  "Group Assignment",
] as const;

interface Cohort { id: string; name: string }
interface Course { id: string; title: string; cohort_id?: string | null }

interface Props {
  cohorts: Cohort[];
  courses: Course[];
  /** Set to record for one student only (their profile page). Omitted = whole cohort. */
  student?: { id: string; name: string; cohort_id: string | null };
  onSaved?: () => void;
  trigger?: React.ReactNode;
}

interface RosterRow {
  id: string;
  name: string;
  email: string;
  score: string;
  remark: string;
}

interface ExistingTask {
  id: string;
  title: string;
  category: string;
  max_points: number;
  is_manual_record: boolean;
}

const todayLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

/**
 * Enter a mark for work that never passed through the LMS.
 *
 * An offline record is written as an ordinary assignment plus graded
 * submissions, so it reaches Grades, the transcript and analytics by the same
 * path as online work — see the is_manual_record migration for why.
 */
const ManualRecordDialog = ({ cohorts, courses, student, onSaved, trigger }: Props) => {
  const singleStudent = !!student;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cohortId, setCohortId] = useState(student?.cohort_id || "");
  const [courseId, setCourseId] = useState("");
  const [category, setCategory] = useState<string>("Class Work");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recordDate, setRecordDate] = useState(todayLocal());
  const [maxPoints, setMaxPoints] = useState("100");

  // Single-student mode
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [score, setScore] = useState("");
  const [remark, setRemark] = useState("");
  const [existingTasks, setExistingTasks] = useState<ExistingTask[]>([]);
  const [existingTaskId, setExistingTaskId] = useState("");

  // Cohort mode
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterSearch, setRosterSearch] = useState("");

  const cohortCourses = useMemo(
    () => courses.filter((c) => !c.cohort_id || !cohortId || c.cohort_id === cohortId),
    [courses, cohortId]
  );

  const selectedExisting = existingTasks.find((t) => t.id === existingTaskId);
  const effectiveMax = mode === "existing" && selectedExisting
    ? selectedExisting.max_points
    : Number(maxPoints) || 0;

  const resetForm = () => {
    setCourseId("");
    setCategory("Class Work");
    setTitle("");
    setDescription("");
    setRecordDate(todayLocal());
    setMaxPoints("100");
    setScore("");
    setRemark("");
    setExistingTaskId("");
    setRoster((rows) => rows.map((r) => ({ ...r, score: "", remark: "" })));
  };

  // Roster for cohort mode; existing tasks for single-student mode.
  useEffect(() => {
    if (!open || !cohortId) return;
    let cancelled = false;

    const load = async () => {
      if (singleStudent) {
        const { data } = await supabase
          .from("assignments")
          .select("id, title, category, max_points, is_manual_record")
          .eq("cohort_id", cohortId)
          .order("due_date", { ascending: false });
        if (!cancelled) setExistingTasks(data || []);
        return;
      }

      setLoadingRoster(true);
      const { data, error } = await supabase
        .from("students")
        .select("id, profiles(first_name, last_name, email)")
        .eq("cohort_id", cohortId)
        .eq("is_staff_preview", false);
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load the cohort roster");
        setRoster([]);
      } else {
        type RosterQueryRow = {
          id: string;
          profiles: { first_name: string | null; last_name: string | null; email: string | null } | null;
        };
        setRoster(
          ((data as unknown as RosterQueryRow[]) || [])
            .map((s) => ({
              id: s.id,
              name: `${s.profiles?.first_name || ""} ${s.profiles?.last_name || ""}`.trim() || "Unnamed student",
              email: s.profiles?.email || "",
              score: "",
              remark: "",
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      setLoadingRoster(false);
    };

    load();
    return () => { cancelled = true; };
  }, [open, cohortId, singleStudent]);

  const setRosterField = (id: string, field: "score" | "remark", value: string) => {
    setRoster((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const scoredRows = roster.filter((r) => r.score.trim() !== "");

  const validateScore = (raw: string, max: number) => {
    const n = parseFloat(raw);
    if (isNaN(n) || n < 0 || n > max) return null;
    return n;
  };

  const handleSave = async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id || null;
    const stamp = new Date(`${recordDate}T12:00:00`).toISOString();

    try {
      setSaving(true);

      // Existing task: nothing to create, just record this student's mark.
      if (singleStudent && mode === "existing") {
        if (!existingTaskId) { toast.error("Pick a task"); return; }
        const value = validateScore(score, effectiveMax);
        if (value === null) { toast.error(`Enter a score between 0 and ${effectiveMax}`); return; }

        const { data: existing } = await supabase
          .from("assignment_submissions")
          .select("id")
          .eq("assignment_id", existingTaskId)
          .eq("student_id", student!.id)
          .maybeSingle();

        const payload = {
          grade: value,
          feedback: remark || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: userId,
        };

        const { error } = existing
          ? await supabase.from("assignment_submissions").update(payload).eq("id", existing.id)
          : await supabase.from("assignment_submissions").insert({
              ...payload,
              assignment_id: existingTaskId,
              student_id: student!.id,
              submitted_at: stamp,
            });
        if (error) throw error;

        toast.success("Record saved");
        setOpen(false);
        resetForm();
        onSaved?.();
        return;
      }

      // New offline record.
      if (!cohortId || !courseId) { toast.error("Select a cohort and course"); return; }
      if (!title.trim()) { toast.error("Give the record a title"); return; }
      const max = Number(maxPoints);
      if (!max || max < 1 || max > 1000) { toast.error("Maximum points must be between 1 and 1000"); return; }

      const marks: Array<{ student_id: string; grade: number; feedback: string | null }> = [];
      if (singleStudent) {
        const value = validateScore(score, max);
        if (value === null) { toast.error(`Enter a score between 0 and ${max}`); return; }
        marks.push({ student_id: student!.id, grade: value, feedback: remark || null });
      } else {
        if (scoredRows.length === 0) { toast.error("Enter a score for at least one student"); return; }
        for (const row of scoredRows) {
          const value = validateScore(row.score, max);
          if (value === null) { toast.error(`${row.name}: score must be between 0 and ${max}`); return; }
          marks.push({ student_id: row.id, grade: value, feedback: row.remark || null });
        }
      }

      const { data: created, error: taskErr } = await supabase
        .from("assignments")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          due_date: stamp,
          cohort_id: cohortId,
          course_id: courseId,
          category,
          max_points: max,
          is_manual_record: true,
          created_by: userId,
        })
        .select("id")
        .single();
      if (taskErr) throw taskErr;

      const { error: marksErr } = await supabase.from("assignment_submissions").insert(
        marks.map((m) => ({
          assignment_id: created.id,
          student_id: m.student_id,
          grade: m.grade,
          feedback: m.feedback,
          submitted_at: stamp,
          reviewed_at: new Date().toISOString(),
          reviewed_by: userId,
        }))
      );
      // The task row is useless without its marks, so don't leave it behind.
      if (marksErr) {
        await supabase.from("assignments").delete().eq("id", created.id);
        throw marksErr;
      }

      toast.success(
        singleStudent ? "Record added" : `Recorded ${marks.length} ${marks.length === 1 ? "mark" : "marks"}`
      );
      setOpen(false);
      resetForm();
      onSaved?.();
    } catch (err) {
      console.error("[ManualRecord] Save error:", err);
      toast.error("Failed to save the record");
    } finally {
      setSaving(false);
    }
  };

  const visibleRoster = roster.filter((r) => {
    const q = rosterSearch.toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  const detailsForm = (
    <div className="space-y-4">
      {!singleStudent && (
        <div>
          <Label>Cohort *</Label>
          <Select value={cohortId} onValueChange={setCohortId}>
            <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
            <SelectContent>
              {cohorts.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Course *</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
            <SelectContent>
              {cohortCourses.map((c) => (<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {RECORD_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Onsite practical — Week 4" />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Where and how this was assessed (optional)"
          rows={2}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Date of the work *</Label>
          <Input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
        </div>
        <div>
          <Label>Maximum points *</Label>
          <Input
            type="number" min={1} max={1000}
            value={maxPoints}
            onChange={(e) => setMaxPoints(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const singleScoreFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label>Score *</Label>
        <Input
          type="number" min={0} max={effectiveMax || undefined} step="any"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder={effectiveMax ? `0 – ${effectiveMax}` : "Score"}
        />
      </div>
      <div>
        <Label>Remark</Label>
        <Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Feedback (optional)" />
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="flex items-center gap-2">
            <ClipboardPen className="h-4 w-4" /> Record Offline Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{singleStudent ? `Add a record for ${student!.name}` : "Record an offline task"}</DialogTitle>
          <DialogDescription>
            Enter marks for work done outside the LMS. Saved records count towards the student's
            grades and transcript exactly like online tasks.
          </DialogDescription>
        </DialogHeader>

        {singleStudent ? (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")} className="pt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">New offline record</TabsTrigger>
              <TabsTrigger value="existing">Existing task</TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="space-y-4 pt-4">
              {detailsForm}
              {singleScoreFields}
            </TabsContent>
            <TabsContent value="existing" className="space-y-4 pt-4">
              <div>
                <Label>Task *</Label>
                <Select value={existingTaskId} onValueChange={setExistingTaskId}>
                  <SelectTrigger><SelectValue placeholder="Select a task from this cohort" /></SelectTrigger>
                  <SelectContent>
                    {existingTasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title} · {t.category} · {t.max_points} pts
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {existingTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">No tasks exist for this student's cohort yet.</p>
                )}
              </div>
              {singleScoreFields}
              <p className="text-xs text-muted-foreground">
                This overwrites any mark the student already has on the selected task.
              </p>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4 pt-2">
            {detailsForm}
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <Label>Scores</Label>
                <span className="text-xs text-muted-foreground">
                  {scoredRows.length} of {roster.length} entered
                </span>
              </div>
              {!cohortId ? (
                <p className="text-sm text-muted-foreground">Select a cohort to list its students.</p>
              ) : loadingRoster ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
                </div>
              ) : roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">This cohort has no students.</p>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search students"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead className="w-28">Score</TableHead>
                          <TableHead className="w-52">Remark</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRoster.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <div className="font-medium text-sm">{r.name}</div>
                              <div className="text-xs text-muted-foreground">{r.email}</div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" min={0} max={effectiveMax || undefined} step="any"
                                value={r.score}
                                onChange={(e) => setRosterField(r.id, "score", e.target.value)}
                                placeholder="—"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={r.remark}
                                onChange={(e) => setRosterField(r.id, "remark", e.target.value)}
                                placeholder="Optional"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Leave a student's score blank to skip them — only students with a score get a record.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="sticky bottom-0 bg-background pt-4 border-t">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving
              ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>)
              : (<><ClipboardPen className="h-4 w-4 mr-2" /> Save Record</>)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManualRecordDialog;
