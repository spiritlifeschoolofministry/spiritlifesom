import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';
import { classifyIntent } from '@/lib/chat-intents';
import { isNavigationalQuestion, matchPage, type Audience } from '@/lib/portal-map';

/**
 * Answering a question, as cheaply as it can honestly be answered.
 *
 * Three routes, tried in this order, and only the last one costs anything:
 *
 *   1. "Where do I…" — answered here, in the browser, from the portal map. No
 *      network call, no model, and it cannot be wrong: it is reading the same
 *      structure the sidebar renders from.
 *   2. A recognised data question — one round trip to `ai-chat`, which reads
 *      the records and returns figures. No model, nothing charged.
 *   3. Anything else — the same round trip, but the function falls through to
 *      one model call against the chat allowance.
 *
 * The ordering is deliberate: a navigational question wants a location, not a
 * balance, so "where do I pay my fees" gets the Fees page rather than a figure
 * the person did not ask for.
 */

export type AnswerSource = 'portal' | 'records' | 'model';

export interface ChatFigure {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
}

export interface ChatAnswer {
  answer: string;
  figures: ChatFigure[];
  items: { label: string; detail?: string }[];
  page: { path: string; label: string } | null;
  /** Which of the three routes answered, so the UI can be honest about it. */
  source: AnswerSource;
}

/**
 * A navigational answer, built from the portal map.
 *
 * Phrased as a fact about the software because that is what it is — "it is
 * under Learning, called Course Materials" is checkable by looking at the
 * sidebar. Nothing here is generated.
 */
const portalAnswer = (question: string, audience: Audience): ChatAnswer | null => {
  const match = matchPage(question, audience);
  if (!match) return null;
  const { page } = match;
  return {
    answer: `You can ${page.what}. It is in the sidebar under ${page.group}, called “${page.label}”.`,
    figures: [],
    items: [],
    page: { path: page.path, label: page.label },
    source: 'portal',
  };
};

/**
 * Asks the question, by the cheapest route that can answer it.
 *
 * The intent is sent as a hint so the function knows which records to read.
 * It is not a permission: `ai-chat` checks the intent belongs to the caller's
 * audience and scopes every read to their own token, so this being wrong — or
 * tampered with — cannot reach anybody else's data.
 */
export const askAssistant = async (
  question: string,
  audience: Audience,
): Promise<ChatAnswer> => {
  const asked = question.trim();

  // Route 1. Free, instant, and offline.
  if (isNavigationalQuestion(asked)) {
    const local = portalAnswer(asked, audience);
    if (local) return local;
  }

  const intent = classifyIntent(asked, audience);

  // A question that named no data and no page: try the map once more before
  // spending a call, since "materials" on its own is still a page.
  if (!intent) {
    const local = portalAnswer(asked, audience);
    if (local) return local;
  }

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { question: asked, intent: intent ?? undefined },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'The assistant could not answer.'));

  return {
    answer: String(data?.answer ?? ''),
    figures: (data?.figures ?? []) as ChatFigure[],
    items: (data?.items ?? []) as ChatAnswer['items'],
    page: (data?.page ?? null) as ChatAnswer['page'],
    source: data?.source === 'model' ? 'model' : 'records',
  };
};

/**
 * Whether a question can be answered without any network call at all.
 *
 * Exported so the UI can answer instantly rather than showing a spinner for
 * something it already knows.
 */
export const canAnswerLocally = (question: string, audience: Audience): boolean =>
  portalAnswer(question, audience) !== null &&
  (isNavigationalQuestion(question) || classifyIntent(question, audience) === null);
