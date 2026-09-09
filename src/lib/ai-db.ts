import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * The Supabase client with its generated types set aside.
 *
 * `src/integrations/supabase/types.ts` is generated from the live schema and
 * says so at the top — it cannot know about a table or column added by a
 * migration that has not been applied and re-generated yet. The AI work adds
 * several (`ai_usage`, `ai_summaries`, `question_bank.status`,
 * `course_materials.tags`, the `ai_suggested_*` columns on `exam_answers`), so
 * every query touching them would otherwise fail to compile.
 *
 * AuditLog.tsx solved the same problem by hand-writing a one-off interface at
 * its call site. One shared, documented accessor is better than a dozen of
 * those: the cast is explained once, and the row shapes below carry the real
 * typing that the cast gives up.
 *
 * Re-generate the types (`supabase gen types typescript`) after applying the
 * migrations and these can be replaced with plain `supabase` calls.
 */
export const aiDb = supabase as unknown as SupabaseClient;

// ---------------------------------------------------------------------------
// Row shapes, hand-written to replace what the cast gives up
// ---------------------------------------------------------------------------

/** A `question_bank` row as the AI features read and write it. */
export interface QuestionRow {
  id: string;
  course_id: string;
  cohort_id: string | null;
  question_type: string;
  question_text: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  rubric: string | null;
  points: number;
  tags: string[] | null;
  archived: boolean;
  /** 'approved' for anything a student may see; 'draft' until someone says so. */
  status: string;
  source_material_id: string | null;
  ai_generated: boolean;
  created_at: string;
}

/**
 * A `practice_questions` row.
 *
 * Deliberately not a `QuestionRow`. The two tables hold different things — real
 * exam questions and questions students may practise against — and giving them
 * one type in the client is the first step towards giving them one query.
 */
export interface PracticeQuestionRow {
  id: string;
  course_id: string;
  cohort_id: string | null;
  question_type: string;
  question_text: string;
  options: unknown;
  correct_answer: unknown;
  explanation: string | null;
  points: number;
  archived: boolean;
  /** 'approved' before a student may practise it; 'draft' until someone reads it. */
  status: string;
  source_material_id: string | null;
  ai_generated: boolean;
  created_at: string;
}

/** A `course_materials` row, as much of it as the AI features need. */
export interface MaterialRow {
  id: string;
  course_id: string | null;
  cohort_id: string | null;
  title: string;
  description: string | null;
  material_type: string | null;
  file_url: string | null;
  storage_path: string | null;
  file_type: string | null;
  tags: string[] | null;
  learning_modes: string[] | null;
  ai_excerpt: string | null;
}

/** The AI's proposed mark on an answer, kept clear of the real one. */
export interface AnswerSuggestion {
  id: string;
  attempt_id: string;
  question_id: string;
  answer: unknown;
  points_awarded: number | null;
  manual_feedback: string | null;
  ai_suggested_points: number | null;
  ai_suggested_feedback: string | null;
  ai_marked_at: string | null;
}
