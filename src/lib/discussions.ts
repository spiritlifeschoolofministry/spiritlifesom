/** Course discussions: a question's status and the list filters. */

export type QuestionFilter = "all" | "open" | "unanswered" | "needs-staff" | "mine";

interface QuestionLike {
  author_id: string | null;
  is_resolved: boolean | null;
  answer_count: number | null;
  has_staff_answer: boolean | null;
}

/** The one pill a question carries in the list. */
export const questionStatus = (
  question: QuestionLike,
): { label: string; tone: "success" | "info" | "warning" | "neutral" } => {
  if (question.is_resolved) return { label: "Resolved", tone: "success" };
  if (question.has_staff_answer) return { label: "Staff answered", tone: "info" };
  if ((question.answer_count ?? 0) > 0) return { label: "Answered", tone: "neutral" };
  return { label: "Waiting for an answer", tone: "warning" };
};

export const matchesFilter = (question: QuestionLike, filter: QuestionFilter, userId: string): boolean => {
  switch (filter) {
    case "open":
      return !question.is_resolved;
    case "unanswered":
      return !question.is_resolved && (question.answer_count ?? 0) === 0;
    case "needs-staff":
      return !question.is_resolved && !question.has_staff_answer;
    case "mine":
      return question.author_id === userId;
    default:
      return true;
  }
};
