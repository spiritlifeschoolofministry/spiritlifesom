import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * First drafts for announcements and student emails.
 *
 * The draft is always written into a field the person is already editing, and
 * this module has no send or publish path of its own — that stays where it
 * already is, behind its own button. The value here is not the prose, which an
 * admin could write faster themselves; it is that the figures in it were looked
 * up server-side rather than by hand.
 */

export const MESSAGE_KINDS = [
  'announcement',
  'fee_reminder',
  'attendance_nudge',
  'exam_notice',
  'general',
] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  announcement: 'Portal announcement',
  fee_reminder: 'Fee reminder',
  attendance_nudge: 'Attendance nudge',
  exam_notice: 'Exam notice',
  general: 'General message',
};

export interface MessageDraft {
  /** Present for emails; an announcement has a title field of its own. */
  subject?: string;
  body: string;
  /**
   * The figures the draft was built from, so the writer can check them before
   * sending. A draft nobody can audit is a draft nobody should send.
   */
  facts: string;
  provider?: string;
}

export const draftMessage = async (args: {
  kind: MessageKind;
  /** What the writer wants said, in their own words. Optional. */
  brief?: string;
  cohortId?: string | null;
  /** False for an announcement, whose title is a separate field. */
  subject?: boolean;
}): Promise<MessageDraft> => {
  const { data, error } = await supabase.functions.invoke('ai-message', {
    body: {
      kind: args.kind,
      brief: args.brief ?? '',
      cohort_id: args.cohortId ?? null,
      subject: args.subject ?? true,
    },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'Could not draft a message.'));

  return {
    subject: data?.subject ? String(data.subject) : undefined,
    body: String(data?.body ?? ''),
    facts: String(data?.facts ?? ''),
    provider: data?.provider,
  };
};
