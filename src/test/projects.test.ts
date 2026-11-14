import { describe, expect, it, vi } from "vitest";

// project-result imports the Supabase client; only its pure helpers are tested.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { overallWithProject, toProjectResult } = await import("@/lib/project-result");
import {
  USUAL_RUBRIC,
  archiveEntryProblem,
  archiveYears,
  averagePercent,
  combineScores,
  daysUntilPurge,
  matchesArchiveSearch,
  projectSettingsProblem,
  scoreTargets,
  defenceEvents,
  defenceProjectId,
  formatPercent,
  fromLocalInput,
  parseMembers,
  rubricOutOf,
  isProjectComplete,
  latestSubmission,
  parseRubricScores,
  projectFilePath,
  projectFileProblem,
  projectStep,
  rubricProblem,
  rubricTotal,
  stagesApproved,
  toLocalInput,
  topicProblem,
} from "@/lib/projects";

const project = (over: Partial<Parameters<typeof projectStep>[0]> = {}) => ({
  status: "approved",
  defence_at: null,
  outcome: null,
  final_approved_at: null,
  ...over,
});

describe("defence rubric", () => {
  // A cohort's own rubric: it need not add up to 100.
  const criteria = [
    { id: "c1", label: "Content", max_marks: 20 },
    { id: "c2", label: "Delivery", max_marks: 10 },
    { id: "c3", label: "Questions", max_marks: 10 },
  ];
  const full = { c1: 16, c2: 7.5, c3: 8 };

  it("is marked out of whatever the cohort's criteria add up to", () => {
    expect(rubricOutOf(criteria)).toBe(40);
    expect(rubricOutOf([])).toBe(0);
    expect(rubricOutOf(USUAL_RUBRIC.map((row, i) => ({ id: String(i), ...row })))).toBe(100);
  });

  it("adds the marks up", () => {
    expect(rubricTotal(criteria, full)).toBe(31.5);
    expect(rubricTotal(criteria, { c1: 10.5 })).toBe(10.5);
  });

  it("wants every criterion marked, within its maximum", () => {
    expect(rubricProblem(criteria, full)).toBeNull();
    expect(rubricProblem(criteria, { c1: 16, c2: 7.5 })).toMatch(/Questions/);
    expect(rubricProblem(criteria, { ...full, c1: 21 })).toMatch(/out of 20/);
    expect(rubricProblem(criteria, { ...full, c3: -1 })).toMatch(/out of 10/);
  });

  it("refuses to score a cohort that has no rubric", () => {
    expect(rubricProblem([], {})).toMatch(/rubric/);
  });

  it("reads saved marks back, dropping removed criteria and non-numbers", () => {
    expect(parseRubricScores(criteria, { c1: 12, gone: 99, c2: "7" })).toEqual({ c1: 12 });
    expect(parseRubricScores(criteria, null)).toEqual({});
  });

  it("writes the final score as a percentage", () => {
    expect(formatPercent(78.75)).toBe("78.75%");
    expect(formatPercent("80.00")).toBe("80%");
    expect(formatPercent(null)).toBe("");
  });
});

describe("group projects", () => {
  it("reads the member list, lead first as the database sends it", () => {
    const members = parseMembers([
      { student_id: "s1", profile_id: "p1", name: "Ada Obi", code: "STU/001", lead: true },
      { student_id: "s2", profile_id: "p2", name: "", code: null, lead: false },
      { nonsense: true },
      null,
    ]);
    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ name: "Ada Obi", lead: true });
    expect(members[1]).toMatchObject({ name: "Unnamed", code: null, lead: false });
    expect(parseMembers(null)).toEqual([]);
  });
});

describe("defences on the calendar", () => {
  const rows = [
    { id: "p1", title: "Prayer in the early church", defence_at: "2026-12-01T09:00:00Z", defence_venue: "Hall B", member_names: "Ada Obi, Tunde Bello", cohort_id: "c" },
    { id: "p2", title: "No date yet", defence_at: null, defence_venue: null, member_names: "Someone", cohort_id: "c" },
  ];

  it("turns only scheduled defences into entries", () => {
    const events = defenceEvents(rows, "staff");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "defence:p1",
      title: "Defence: Ada Obi, Tunde Bello",
      category: "Defence",
      start_date: "2026-12-01T09:00:00Z",
    });
    expect(events[0].description).toContain("Hall B");
  });

  it("does not name anyone on a student's own calendar", () => {
    expect(defenceEvents(rows, "student")[0].title).toBe("Your project defence");
  });

  it("tells a defence entry from a real event by its id", () => {
    expect(defenceProjectId("defence:p1")).toBe("p1");
    expect(defenceProjectId("8f1c0c1e-aaaa-bbbb-cccc-000000000000")).toBeNull();
  });
});

describe("project on the record", () => {
  const row = { id: "p1", title: "T", is_group: true, outcome_note: null, outcome_at: "2026-12-02T10:00:00Z" };

  it("has no percentage until a result is recorded, even if scores are in", () => {
    expect(toProjectResult({ ...row, outcome: null, final_score: 80 }).percent).toBeNull();
    const done = toProjectResult({ ...row, outcome: "pass", final_score: 78.754 });
    expect(done).toMatchObject({ percent: 78.75, outcome: "Passed", isGroup: true });
  });

  it("counts the project as one more unit beside the courses", () => {
    expect(overallWithProject([60, 70], null)).toBe(65);
    expect(overallWithProject([60, 70], 80)).toBe(70);
    expect(overallWithProject([], 80)).toBe(80);
    expect(overallWithProject([], null)).toBe(0);
  });

  it("weighs the project by the cohort's setting", () => {
    // Double weight: (60 + 70 + 80 + 80) / 4.
    expect(overallWithProject([60, 70], 80, 2)).toBe(73);
    // Half a course: (60 + 70 + 40) / 2.5.
    expect(overallWithProject([60, 70], 80, 0.5)).toBe(68);
    // Zero: on the record, out of the average.
    expect(overallWithProject([60, 70], 80, 0)).toBe(65);
    expect(overallWithProject([], 80, 0)).toBe(0);
  });

  it("carries the cohort's weight on the result, defaulting to one course", () => {
    const row = { id: "p", title: "T", is_group: false, outcome: "pass", outcome_note: null, outcome_at: null, final_score: 70 };
    expect(toProjectResult(row).weight).toBe(1);
    expect(toProjectResult(row, 2.5).weight).toBe(2.5);
    expect(toProjectResult(row, -3).weight).toBe(1);
  });
});

describe("scoring modes", () => {
  it("says which score sheets the panel fills in", () => {
    expect(scoreTargets("group")).toEqual({ group: true, individual: false });
    expect(scoreTargets("individual")).toEqual({ group: false, individual: true });
    expect(scoreTargets("both")).toEqual({ group: true, individual: true });
    expect(scoreTargets(null)).toEqual({ group: true, individual: false });
  });

  it("averages the panel as percentages, whatever each score was out of", () => {
    expect(averagePercent([{ total: 30, out_of: 40 }, { total: "45", out_of: "50" }])).toBe(82.5);
    expect(averagePercent([])).toBeNull();
    expect(averagePercent([{ total: 5, out_of: 0 }])).toBeNull();
  });

  it("gives every member the group score in group mode", () => {
    expect(combineScores("group", 72, 90, 50)).toBe(72);
    expect(combineScores("group", null, 90, 50)).toBeNull();
  });

  it("gives each member their own score in individual mode", () => {
    expect(combineScores("individual", 72, 90, 50)).toBe(90);
    expect(combineScores("individual", 72, null, 50)).toBeNull();
  });

  it("combines the two by the weight in both mode, and waits until both exist", () => {
    expect(combineScores("both", 80, 60, 50)).toBe(70);
    expect(combineScores("both", 80, 60, 25)).toBe(75);
    expect(combineScores("both", 80, 60, 100)).toBe(60);
    expect(combineScores("both", 80, null, 50)).toBeNull();
    expect(combineScores("both", null, 60, 50)).toBeNull();
  });

  it("reads a member's own score for staff", () => {
    expect(parseMembers([{ student_id: "s1", profile_id: "p1", name: "A", lead: true, score: 71.5 }])[0].score).toBe(71.5);
    expect(parseMembers([{ student_id: "s1", profile_id: "p1", name: "A", lead: true, score: null }])[0].score).toBeNull();
  });
});

describe("cohort project settings", () => {
  it("accepts a weight from 0 to 20 and a group of 2 to 100", () => {
    expect(projectSettingsProblem({ weight: "1", groupMax: "10" })).toBeNull();
    expect(projectSettingsProblem({ weight: "0", groupMax: "2" })).toBeNull();
    expect(projectSettingsProblem({ weight: "", groupMax: "10" })).toMatch(/weight/);
    expect(projectSettingsProblem({ weight: "21", groupMax: "10" })).toMatch(/weight/);
    expect(projectSettingsProblem({ weight: "1", groupMax: "1" })).toMatch(/group/);
    expect(projectSettingsProblem({ weight: "1", groupMax: "4.5" })).toMatch(/group/);
  });
});

describe("the bin", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  it("counts the days left before a deleted project is purged", () => {
    expect(daysUntilPurge("2026-12-20T12:00:00Z", now)).toBe(30);
    expect(daysUntilPurge("2026-11-21T06:00:00Z", now)).toBe(1);
    expect(daysUntilPurge("2026-11-19T12:00:00Z", now)).toBe(0);
    expect(daysUntilPurge(null, now)).toBe(0);
  });
});

describe("project archive", () => {
  const rows = [
    { title: "Prayer in the early church", abstract: "Acts and after", authors: "Ada Obi", cohort_name: "2024 Session", year: 2024 },
    { title: "Church planting", abstract: "", authors: "Tunde Bello, Ngozi Eze", cohort_name: null, year: 2019 },
    { title: "Undated work", abstract: null, authors: "Someone", cohort_name: null, year: null },
  ];

  it("searches the title, topic, authors and cohort", () => {
    const found = (text: string) => rows.filter((row) => matchesArchiveSearch(row, text)).map((row) => row.title);
    expect(found("  ")).toHaveLength(3);
    expect(found("ngozi")).toEqual(["Church planting"]);
    expect(found("acts")).toEqual(["Prayer in the early church"]);
    expect(found("2024 session")).toEqual(["Prayer in the early church"]);
    expect(found("nothing like this")).toEqual([]);
  });

  it("lists the years present, newest first, ignoring undated projects", () => {
    expect(archiveYears(rows)).toEqual([2024, 2019]);
  });

  it("checks a past project before it is added", () => {
    expect(archiveEntryProblem({ title: "Church planting in Oyo", authors: "Ada Obi", year: "2019" })).toBeNull();
    expect(archiveEntryProblem({ title: "Church planting in Oyo", authors: "Ada Obi", year: "" })).toBeNull();
    expect(archiveEntryProblem({ title: "Hi", authors: "Ada Obi", year: "" })).toMatch(/title/);
    expect(archiveEntryProblem({ title: "Church planting in Oyo", authors: "", year: "" })).toMatch(/who/);
    expect(archiveEntryProblem({ title: "Church planting in Oyo", authors: "Ada Obi", year: "19" })).toMatch(/year/);
  });
});

describe("project progress", () => {
  it("shows the topic status until the topic is approved", () => {
    // A group the school formed, before its lead has sent a topic.
    expect(projectStep(project({ status: "awaiting_topic" })).label).toBe("No topic yet");
    expect(projectStep(project({ status: "proposed" })).label).toBe("Waiting for approval");
    expect(projectStep(project({ status: "changes_requested" })).label).toBe("Changes asked for");
    expect(projectStep(project({ status: "rejected" })).label).toBe("Not approved");
  });

  it("follows an approved project through defence to the result", () => {
    expect(projectStep(project()).label).toBe("In progress");
    expect(projectStep(project({ defence_at: "2026-12-01T10:00:00Z" })).label).toBe("Defence scheduled");
    expect(projectStep(project({ outcome: "redefend" })).label).toBe("To defend again");
    expect(projectStep(project({ outcome: "pass" })).label).toBe("Completed");
  });

  it("is not complete after 'pass with corrections' until the corrected copy is approved", () => {
    const waiting = project({ outcome: "pass_with_corrections" });
    expect(projectStep(waiting).label).toBe("Corrections due");
    expect(isProjectComplete(waiting)).toBe(false);
    const signedOff = project({ outcome: "pass_with_corrections", final_approved_at: "2026-12-10T10:00:00Z" });
    expect(projectStep(signedOff).label).toBe("Completed");
    expect(isProjectComplete(signedOff)).toBe(true);
    expect(isProjectComplete(project({ outcome: "pass" }))).toBe(true);
    expect(isProjectComplete(project({ outcome: "redefend" }))).toBe(false);
  });
});

describe("project drafts", () => {
  const rows = [
    { stage_id: "a", kind: "stage", status: "changes_requested", submitted_at: "2026-11-01T09:00:00Z" },
    { stage_id: "a", kind: "stage", status: "approved", submitted_at: "2026-11-05T09:00:00Z" },
    { stage_id: "b", kind: "stage", status: "approved", submitted_at: "2026-11-02T09:00:00Z" },
    { stage_id: "b", kind: "stage", status: "submitted", submitted_at: "2026-11-06T09:00:00Z" },
    { stage_id: null, kind: "correction", status: "submitted", submitted_at: "2026-11-09T09:00:00Z" },
  ];

  it("takes the newest draft of a stage as the one that counts", () => {
    expect(latestSubmission(rows, "a")?.status).toBe("approved");
    expect(latestSubmission(rows, "b")?.status).toBe("submitted");
    expect(latestSubmission(rows, "c")).toBeNull();
  });

  it("finds the corrected copy separately from stage drafts", () => {
    expect(latestSubmission(rows, null)?.kind).toBe("correction");
  });

  it("counts a stage as approved only when its newest draft is", () => {
    expect(stagesApproved(["a", "b", "c"], rows)).toBe(1);
  });
});

describe("project forms", () => {
  it("asks for a title and a real description of the topic", () => {
    const about = "A study of discipleship practice among new converts in three Ibadan churches.";
    expect(topicProblem("Discipleship after conversion", about)).toBeNull();
    expect(topicProblem("Hi", about)).toMatch(/title/);
    expect(topicProblem("Discipleship after conversion", "Too short")).toMatch(/Describe/);
  });

  it("accepts documents up to 25 MB and nothing else", () => {
    expect(projectFileProblem({ name: "Chapter 1.PDF", size: 1000 })).toBeNull();
    expect(projectFileProblem({ name: "draft.docx", size: 1000 })).toBeNull();
    expect(projectFileProblem({ name: "photo.png", size: 1000 })).toMatch(/PDF or a Word/);
    expect(projectFileProblem({ name: "noextension", size: 1000 })).toMatch(/PDF or a Word/);
    expect(projectFileProblem({ name: "big.pdf", size: 26 * 1024 * 1024 })).toMatch(/25 MB/);
  });

  it("builds a storage path that cannot escape the project's folder", () => {
    expect(projectFilePath("s1", "p1", "../../evil/Chapter 1 (final).pdf", 42)).toBe(
      "projects/s1/p1/42_.._.._evil_Chapter 1 _final_.pdf",
    );
  });

  it("round-trips a defence time through the date-time input", () => {
    const iso = "2026-12-01T09:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeNull();
  });
});
