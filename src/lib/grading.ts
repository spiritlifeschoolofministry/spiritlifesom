/**
 * Official SLSM Grading System
 * Based on the Examination & Continuous Assessment Record
 * 
 * A: 70.0%+ → Excellent (Point 5)
 * B: 60.0-69.9% → Very Good (Point 4)
 * C: 50.0-59.9% → Good (Point 3)
 * D: 45.0-49.9% → Satisfactory (Point 2)
 * E: 40.0-44.9% → Pass (Point 1)
 * F: 0.0-39.9% → Fail (Point 0)
 */

export interface GradeInfo {
  letter: string;
  label: string;
  point: number;
  color: string;
  isPassing: boolean;
}

export const getLetterGrade = (pct: number): GradeInfo => {
  if (pct >= 70) return { letter: "A", label: "Excellent", point: 5, color: "text-emerald-600", isPassing: true };
  if (pct >= 60) return { letter: "B", label: "Very Good", point: 4, color: "text-blue-600", isPassing: true };
  if (pct >= 50) return { letter: "C", label: "Good", point: 3, color: "text-cyan-600", isPassing: true };
  if (pct >= 45) return { letter: "D", label: "Satisfactory", point: 2, color: "text-yellow-600", isPassing: true };
  if (pct >= 40) return { letter: "E", label: "Pass", point: 1, color: "text-orange-600", isPassing: true };
  return { letter: "F", label: "Fail", point: 0, color: "text-red-600", isPassing: false };
};

export const calculateGPA = (gradePoints: number[]): number => {
  if (gradePoints.length === 0) return 0;
  return Number((gradePoints.reduce((s, p) => s + p, 0) / gradePoints.length).toFixed(2));
};
