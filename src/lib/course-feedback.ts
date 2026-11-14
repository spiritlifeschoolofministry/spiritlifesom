/** Course feedback: the questions asked and how answers are summarised. */

export const RATING_QUESTIONS = [
  { key: "rating_overall", label: "Overall, how was this course?", short: "Overall" },
  { key: "rating_content", label: "The content was clear and useful", short: "Content" },
  { key: "rating_teaching", label: "The teaching helped me understand", short: "Teaching" },
  { key: "rating_materials", label: "The materials supported the classes", short: "Materials" },
] as const;

export type RatingKey = (typeof RATING_QUESTIONS)[number]["key"];

export const RATING_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"] as const;

export type FeedbackRatings = Record<RatingKey, number | null>;

export interface FeedbackSummary {
  count: number;
  /** Mean per question to one decimal place; null when nobody has answered. */
  averages: Record<RatingKey, number | null>;
  /** How many gave each overall score, index 0 = 1 star … index 4 = 5 stars. */
  overallSpread: [number, number, number, number, number];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export const summariseFeedback = (rows: Partial<FeedbackRatings>[]): FeedbackSummary => {
  const averages = {} as Record<RatingKey, number | null>;
  for (const { key } of RATING_QUESTIONS) {
    const values = rows.map((row) => row[key]).filter((v): v is number => typeof v === "number");
    averages[key] = values.length ? round1(values.reduce((sum, v) => sum + v, 0) / values.length) : null;
  }
  const overallSpread: FeedbackSummary["overallSpread"] = [0, 0, 0, 0, 0];
  for (const row of rows) {
    const score = row.rating_overall;
    if (typeof score === "number" && score >= 1 && score <= 5) overallSpread[Math.round(score) - 1] += 1;
  }
  return { count: rows.length, averages, overallSpread };
};

/** "12 of 40 (30%)". A cohort of nobody reads as a plain count. */
export const responseRate = (responses: number, cohortSize: number): string =>
  cohortSize > 0
    ? `${responses} of ${cohortSize} (${Math.round((responses / cohortSize) * 100)}%)`
    : `${responses}`;

/** True when every rating has been chosen. */
export const ratingsComplete = (ratings: FeedbackRatings): boolean =>
  RATING_QUESTIONS.every(({ key }) => {
    const value = ratings[key];
    return typeof value === "number" && value >= 1 && value <= 5;
  });
