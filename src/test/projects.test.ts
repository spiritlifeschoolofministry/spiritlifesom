import { describe, expect, it } from "vitest";
import {
  DEFENCE_RUBRIC,
  RUBRIC_TOTAL,
  fromLocalInput,
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
  const full = { content: 24, biblical: 20, presentation: 15, questions: 12, writing: 8 };

  it("is marked out of 100", () => {
    expect(RUBRIC_TOTAL).toBe(100);
  });

  it("adds the marks up", () => {
    expect(rubricTotal(full)).toBe(79);
    expect(rubricTotal({ content: 10.5 })).toBe(10.5);
  });

  it("wants every criterion marked, within its maximum", () => {
    expect(rubricProblem(full)).toBeNull();
    expect(rubricProblem({ ...full, writing: undefined })).toMatch(/Writing/);
    expect(rubricProblem({ ...full, content: 31 })).toMatch(/out of 30/);
    expect(rubricProblem({ ...full, questions: -1 })).toMatch(/out of 15/);
  });

  it("reads saved marks back and drops anything that is not a rubric mark", () => {
    expect(parseRubricScores({ content: 20, extra: 99, biblical: "12" })).toEqual({ content: 20 });
    expect(parseRubricScores(null)).toEqual({});
    expect(Object.keys(parseRubricScores(full))).toHaveLength(DEFENCE_RUBRIC.length);
  });
});

describe("project progress", () => {
  it("shows the topic status until the topic is approved", () => {
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
