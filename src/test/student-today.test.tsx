import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/routes/lazy-pages", () => ({ preloadPath: vi.fn(), preloadPortal: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => ({ student: null }) }));

import TodayTimetable from "@/components/redesign/student/TodayTimetable";
import ApplicationTracker from "@/components/redesign/student/ApplicationTracker";
import UpNext from "@/components/student/UpNext";
import type { TodayPlan } from "@/components/redesign/student/useTodayPlan";

const at = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const exam = (id: string, title: string, start: Date, end: Date) => ({
  id,
  title,
  start_at: start.toISOString(),
  end_at: end.toISOString(),
  duration_minutes: 30,
  status: "published",
});

const EMPTY: TodayPlan = { loaded: true, window: null, nextClass: null, todayPapers: [], todayClasses: [] };

const wrap = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("Today's timetable", () => {
  it("renders nothing on a day with no papers or classes", () => {
    const { container } = wrap(<TodayTimetable plan={EMPTY} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists papers and classes in time order with their state in words", () => {
    const plan: TodayPlan = {
      ...EMPTY,
      todayPapers: [
        { exam: exam("b", "SLM 105 Quiz", at(12), at(12, 30)), start: at(12), end: at(12, 30), state: "open" },
        { exam: exam("a", "SLM 103 Mid-term", at(9), at(9, 45)), start: at(9), end: at(9, 45), state: "done" },
      ],
      todayClasses: [
        {
          id: "c1",
          date: ymd(new Date()),
          start_time: "23:58:00",
          end_time: "23:59:00",
          activity_type: "Class",
          course: { code: "SLM105", title: "Spiritual Maturing" },
        },
      ],
    };
    wrap(<TodayTimetable plan={plan} />);
    const rows = within(screen.getByRole("list")).getAllByRole("link");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("SLM 103 Mid-term"),
      expect.stringContaining("SLM 105 Quiz"),
      expect.stringContaining("Class · SLM105 Spiritual Maturing"),
    ]);
    expect(rows[0]).toHaveTextContent("Submitted");
    expect(rows[1]).toHaveTextContent("Lobby open");
    expect(rows[1]).toHaveAttribute("href", "/student/exams/b/lobby");
  });
});

describe("Up next", () => {
  it("sends a single open paper straight to its lobby", () => {
    const e = exam("x", "SLM 105 Quiz", at(0), at(23, 59));
    const plan: TodayPlan = {
      ...EMPTY,
      window: {
        key: "k",
        start: at(0),
        end: at(23, 59),
        exams: [e],
        state: "live",
        done: 0,
        minutesLeft: 60,
        minutesNeeded: 30,
      },
    };
    wrap(<UpNext plan={plan} />);
    expect(screen.getByRole("link", { name: /enter exam lobby/i })).toHaveAttribute("href", "/student/exams/x/lobby");
  });

  it("renders nothing until the plan has loaded", () => {
    const { container } = wrap(<UpNext plan={{ ...EMPTY, loaded: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Application tracker", () => {
  it("marks admissions review as the current step once details are in", () => {
    wrap(
      <ApplicationTracker
        firstName="Ada"
        email="ada@example.com"
        detailsComplete
        learningMode="Physical"
        cohortName="Cohort 2025/26"
      />,
    );
    expect(screen.getByRole("heading", { name: /thanks, ada/i })).toBeInTheDocument();
    const current = screen.getByText(/admissions review/i).closest("li");
    expect(current).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Physical · Cohort 2025/26")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /preview the courses/i })).toHaveAttribute("href", "/student/courses");
  });

  it("asks for details first when they are missing", () => {
    wrap(<ApplicationTracker firstName="Ada" email={null} detailsComplete={false} learningMode={null} cohortName={null} />);
    expect(screen.getByText(/details submitted/i).closest("li")).toHaveAttribute("aria-current", "step");
  });
});
