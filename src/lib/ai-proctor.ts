import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * The post-exam reading list.
 *
 * Deliberately not called a cheating detector, in the code or on the screen.
 * What comes back is which attempts differ from the rest of their own cohort
 * and in what measurable way. Every conclusion is the reader's.
 */

export type SignalKind =
  | 'tab_switching'
  | 'fullscreen_exits'
  | 'stopped_for_breach'
  | 'unusually_fast'
  | 'shared_network'
  | 'same_browser'
  | 'matching_answers'
  | 'no_footage';

export interface Signal {
  kind: SignalKind;
  detail: string;
  /** 1 worth a glance, 3 look at this one first. Ordering only. */
  weight: 1 | 2 | 3;
}

export interface RankedAttempt {
  attemptId: string;
  studentId: string;
  studentName: string;
  signals: Signal[];
  concern: number;
}

export interface ProctorReview {
  exam: string;
  /** Attempts considered, staff rehearsals excluded. */
  reviewed: number;
  attempts: RankedAttempt[];
  /** Attempt id to one plain sentence. Absent where no model answered. */
  notes: Record<string, string>;
  /** True when nothing at all stood out, in which case no model was called. */
  clean: boolean;
  narrated?: boolean;
}

export const reviewExam = async (examId: string): Promise<ProctorReview> => {
  const { data, error } = await supabase.functions.invoke('ai-proctor', {
    body: { exam_id: examId },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'The exam review failed.'));
  return {
    exam: String(data?.exam ?? ''),
    reviewed: Number(data?.reviewed ?? 0),
    attempts: (data?.attempts ?? []) as RankedAttempt[],
    notes: (data?.notes ?? {}) as Record<string, string>,
    clean: !!data?.clean,
    narrated: !!data?.narrated,
  };
};

/** How each signal is labelled on screen. */
export const SIGNAL_LABELS: Record<SignalKind, string> = {
  tab_switching: 'Left the tab',
  fullscreen_exits: 'Left fullscreen',
  stopped_for_breach: 'Stopped automatically',
  unusually_fast: 'Unusually quick',
  shared_network: 'Shared network',
  same_browser: 'Same browser',
  matching_answers: 'Matching answers',
  no_footage: 'No recording',
};
