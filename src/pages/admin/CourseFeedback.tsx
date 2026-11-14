import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/portal/PageSkeleton";
import { AdminPageHeader, Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { RATING_QUESTIONS, RATING_WORDS, responseRate, summariseFeedback } from "@/lib/course-feedback";
import type { Tables } from "@/integrations/supabase/types";

type Course = Pick<Tables<"courses">, "id" | "code" | "title" | "lecturer" | "cohort_id" | "feedback_open">;
type Response = Tables<"course_feedback_responses">;
type Cohort = Pick<Tables<"cohorts">, "id" | "name" | "is_active">;

const AdminCourseFeedback = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [cohortSizes, setCohortSizes] = useState<Record<string, number>>({});
  const [cohortFilter, setCohortFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [coursesRes, cohortsRes, responsesRes, studentsRes] = await Promise.all([
      supabase.from("courses").select("id, code, title, lecturer, cohort_id, feedback_open").order("code"),
      supabase.from("cohorts").select("id, name, is_active").order("start_date", { ascending: false }),
      supabase.from("course_feedback_responses").select("*"),
      supabase.from("students").select("cohort_id, admission_status, is_staff_preview"),
    ]);
    const failed = coursesRes.error ?? cohortsRes.error ?? responsesRes.error ?? studentsRes.error;
    if (failed) {
      console.error("Load course feedback error:", failed);
      toast.error("Could not load course feedback");
    }
    setCourses(coursesRes.data ?? []);
    setCohorts(cohortsRes.data ?? []);
    setResponses(responsesRes.data ?? []);
    const sizes: Record<string, number> = {};
    for (const s of studentsRes.data ?? []) {
      if (!s.cohort_id || s.is_staff_preview) continue;
      if ((s.admission_status ?? "").toUpperCase() === "PENDING") continue;
      sizes[s.cohort_id] = (sizes[s.cohort_id] ?? 0) + 1;
    }
    setCohortSizes(sizes);
    setCohortFilter((current) => current || cohortsRes.data?.find((c) => c.is_active)?.id || "all");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byCourse = useMemo(() => {
    const map = new Map<string, Response[]>();
    for (const row of responses) {
      if (!row.course_id) continue;
      map.set(row.course_id, [...(map.get(row.course_id) ?? []), row]);
    }
    return map;
  }, [responses]);

  const shown = courses.filter((course) => cohortFilter === "all" || course.cohort_id === cohortFilter);
  const selected = shown.find((course) => course.id === selectedId) ?? null;
  const selectedRows = selected ? byCourse.get(selected.id) ?? [] : [];
  const selectedSummary = summariseFeedback(selectedRows);
  const cohortName = (id: string | null) => cohorts.find((c) => c.id === id)?.name ?? "No cohort";

  const setOpen = async (course: Course, open: boolean) => {
    setSavingId(course.id);
    const { error } = await supabase.from("courses").update({ feedback_open: open }).eq("id", course.id);
    setSavingId(null);
    if (error) {
      console.error("Toggle feedback error:", error);
      toast.error("Could not change feedback for this course");
      return;
    }
    setCourses((list) => list.map((c) => (c.id === course.id ? { ...c, feedback_open: open } : c)));
    toast.success(
      open ? `Feedback opened for ${course.code}. Its students have been notified` : `Feedback closed for ${course.code}`,
    );
  };

  if (loading) return <PageSkeleton panels={2} />;

  const comments = (key: "liked" | "improve") =>
    selectedRows.map((row) => row[key]?.trim()).filter((text): text is string => Boolean(text));

  return (
    <div className="space-y-5 pb-6">
      <AdminPageHeader
        section="Teaching"
        title="Course Feedback"
        description="Open feedback on a course and read what students said. Answers are shown without names."
        actions={
          <Select value={cohortFilter} onValueChange={(value) => { setCohortFilter(value); setSelectedId(null); }}>
            <SelectTrigger className="h-10 w-56" aria-label="Cohort"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cohorts</SelectItem>
              {cohorts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <Panel title="Courses" titleId="feedback-courses">
        {shown.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No courses on this cohort.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  {cohortFilter === "all" && <TableHead>Cohort</TableHead>}
                  <TableHead>Responses</TableHead>
                  <TableHead>Overall</TableHead>
                  <TableHead>Open for feedback</TableHead>
                  <TableHead className="text-right">Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((course) => {
                  const rows = byCourse.get(course.id) ?? [];
                  const average = summariseFeedback(rows).averages.rating_overall;
                  return (
                    <TableRow key={course.id} data-state={selectedId === course.id ? "selected" : undefined}>
                      <TableCell>
                        <span className="font-semibold">{course.code}</span>
                        <span className="block text-sm text-muted-foreground">{course.title}</span>
                      </TableCell>
                      {cohortFilter === "all" && <TableCell>{cohortName(course.cohort_id)}</TableCell>}
                      <TableCell>{responseRate(rows.length, course.cohort_id ? cohortSizes[course.cohort_id] ?? 0 : 0)}</TableCell>
                      <TableCell>{average === null ? "No answers yet" : `${average} / 5`}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Switch
                            checked={course.feedback_open}
                            disabled={savingId === course.id || !course.cohort_id}
                            onCheckedChange={(open) => setOpen(course, open)}
                            aria-label={`Feedback open for ${course.code}`}
                          />
                          <StatusPill tone={course.feedback_open ? "good" : "neutral"}>
                            {course.feedback_open ? "Open" : "Closed"}
                          </StatusPill>
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rows.length === 0}
                          onClick={() => setSelectedId(selectedId === course.id ? null : course.id)}
                        >
                          {selectedId === course.id ? "Hide" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {selected && (
        <Panel
          title={`${selected.code}: ${selected.title}`}
          titleId="feedback-results"
          description={`${selectedSummary.count} response${selectedSummary.count === 1 ? "" : "s"}${selected.lecturer ? ` · ${selected.lecturer}` : ""}`}
        >
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground">Average ratings (out of 5)</h3>
              {RATING_QUESTIONS.map((question) => {
                const average = selectedSummary.averages[question.key];
                return (
                  <div key={question.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{question.label}</span>
                      <strong>{average ?? "–"}</strong>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={question.short}
                      aria-valuemin={0}
                      aria-valuemax={5}
                      aria-valuenow={average ?? 0}
                      className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${((average ?? 0) / 5) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              <h3 className="pt-2 text-sm font-bold text-foreground">Overall rating, by answer</h3>
              <ul className="space-y-1 text-sm">
                {RATING_WORDS.map((word, index) => (
                  <li key={word} className="flex justify-between gap-3">
                    <span>{index + 1} · {word}</span>
                    <span className="font-semibold">{selectedSummary.overallSpread[index]}</span>
                  </li>
                )).reverse()}
              </ul>
            </div>
            <div className="space-y-5">
              {([
                ["liked", "What helped most"],
                ["improve", "What should change"],
              ] as const).map(([key, heading]) => (
                <div key={key}>
                  <h3 className="text-sm font-bold text-foreground">{heading}</h3>
                  {comments(key).length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">No comments.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {comments(key).map((text, index) => (
                        <li key={index} className="whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-sm">
                          {text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
};

export default AdminCourseFeedback;
