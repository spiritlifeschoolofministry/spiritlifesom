import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * The student-facing AI, from the browser's side.
 *
 * Nothing here passes a student id. Every call is scoped server-side to the
 * caller's own token, so there is no identifier a client could change to read
 * somebody else's grades, attempts or materials.
 */

const call = async (name: 'ai-student' | 'ai-study', body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'The AI call failed.'));
  return data;
};

// ---------------------------------------------------------------------------
// Progress summary
// ---------------------------------------------------------------------------

export interface ProgressSummary {
  body: string;
  /** True when this was today's already-written summary rather than a new one. */
  cached: boolean;
}

/**
 * A student's progress in a few sentences.
 *
 * Written once a day and cached server-side, so opening the dashboard ten
 * times costs one call. `cached` is surfaced mainly so the UI can avoid
 * implying something was just recalculated when it wasn't.
 */
export const fetchProgressSummary = async (): Promise<ProgressSummary> => {
  const data = await call('ai-student', { action: 'progress' });
  return { body: String(data?.body ?? ''), cached: !!data?.cached };
};

// ---------------------------------------------------------------------------
// Revision guidance
// ---------------------------------------------------------------------------

/**
 * What to revise, from the questions they got wrong.
 *
 * Only available once results are released — before that the student has not
 * been told their marks, and guidance built on them would be telling them
 * sideways. Written once per attempt and then stored.
 */
export const fetchResultGuidance = async (attemptId: string): Promise<string> => {
  const data = await call('ai-student', { action: 'guidance', attempt_id: attemptId });
  return String(data?.body ?? '');
};

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

export interface PracticeQuestion {
  id: string;
  question_text: string;
  question_type: string;
  /** Present for the multiple-choice types. Never includes which one is right. */
  options: string[] | null;
  points: number;
  /** Which course the question came from, so a mixed round can say. */
  course_id?: string | null;
  course_code?: string | null;
  course_title?: string | null;
}

export interface PracticeSession {
  session_id: string;
  questions: PracticeQuestion[];
}

/**
 * Starts a practice round.
 *
 * The answer key stays server-side until each question is answered — that is
 * the whole reason practice goes through a function rather than reading the
 * bank directly, which RLS would refuse anyway.
 */
export const startPractice = async (args: {
  /** Empty means every course the student takes. */
  courseIds: string[];
  /** How many questions to serve. The server clamps this and has its own default. */
  count?: number;
}): Promise<PracticeSession> => {
  const data = await call('ai-student', {
    action: 'practice_start',
    course_ids: args.courseIds,
    ...(args.count ? { count: args.count } : {}),
  });
  return {
    session_id: String(data?.session_id ?? ''),
    questions: (data?.questions ?? []) as PracticeQuestion[],
  };
};

export interface PracticeVerdict {
  correct: boolean | null;
  correct_answer: unknown;
  explanation: string | null;
}

/** Marks one practice answer. Nothing here reaches a grade or a transcript. */
export const answerPractice = async (args: {
  sessionId: string;
  questionId: string;
  answer: unknown;
}): Promise<PracticeVerdict> => {
  const data = await call('ai-student', {
    action: 'practice_answer',
    session_id: args.sessionId,
    question_id: args.questionId,
    answer: args.answer,
  });
  return {
    correct: data?.correct ?? null,
    correct_answer: data?.correct_answer,
    explanation: data?.explanation ? String(data.explanation) : null,
  };
};

// ---------------------------------------------------------------------------
// Study assistant
// ---------------------------------------------------------------------------

export interface StudyMaterial {
  id: string;
  title: string;
  course_id: string | null;
}

/** The materials this student may ask about — their cohort's, their mode's. */
export const listStudyMaterials = async (): Promise<StudyMaterial[]> => {
  const data = await call('ai-study', { action: 'materials' });
  return (data?.materials ?? []) as StudyMaterial[];
};

export interface StudyAnswer {
  answer: string;
  /** The material the answer came from, so the student can go and check it. */
  source: { id: string; title: string };
}

/**
 * Asks a question about one material.
 *
 * The material is chosen by the student rather than guessed, so the answer's
 * source is never in doubt — and an answer of "that isn't covered in these
 * notes" is a correct answer here, not a failure.
 */
export const askAboutMaterial = async (args: {
  materialId: string;
  question: string;
}): Promise<StudyAnswer> => {
  const data = await call('ai-study', {
    action: 'ask',
    material_id: args.materialId,
    question: args.question,
  });
  return {
    answer: String(data?.answer ?? ''),
    source: (data?.source ?? { id: args.materialId, title: '' }) as StudyAnswer['source'],
  };
};
