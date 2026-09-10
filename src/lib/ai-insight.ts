import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge-error';

/**
 * The analytics page, read back in a paragraph.
 *
 * Asked for rather than automatic, and cached for the day: the figures move
 * slowly and the reading of them moves slower, so opening the page ten times
 * costs one call. `cached` is surfaced so the screen can say when it was
 * written rather than implying it was just recalculated.
 */
export interface AnalyticsNote {
  body: string;
  cached: boolean;
}

export const fetchAnalyticsNote = async (
  args: { cohortId?: string | null; refresh?: boolean } = {},
): Promise<AnalyticsNote> => {
  const { data, error } = await supabase.functions.invoke('ai-insight', {
    body: { cohort_id: args.cohortId ?? null, refresh: !!args.refresh },
  });
  if (error) throw new Error(await edgeErrorMessage(error, data, 'Could not read the figures.'));
  return { body: String(data?.body ?? ''), cached: !!data?.cached };
};
