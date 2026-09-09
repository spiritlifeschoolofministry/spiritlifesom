import { supabase } from '@/integrations/supabase/client';

/**
 * Reading the engagement figures back out.
 *
 * Every one of these is a single RPC that aggregates in the database. The
 * obvious alternative — select the events and group them in the browser —
 * would move every row the school has ever recorded over the wire to produce a
 * few dozen numbers, and would get slower every week the portal is used.
 */

export interface DailyActivityPoint {
  day: string;
  /** Short label for a chart axis, e.g. "9 Sep". */
  label: string;
  views: number;
  downloads: number;
  aiCalls: number;
  activeUsers: number;
}

export interface TopSubject {
  subject: string;
  subjectId: string | null;
  events: number;
  people: number;
}

export interface ActivityPulse {
  viewsToday: number;
  downloadsToday: number;
  activeToday: number;
  viewsWeek: number;
  downloadsWeek: number;
  activeWeek: number;
  /**
   * Null when nothing has ever been recorded. The dashboards need this to say
   * "not recording yet" rather than drawing a row of zeros, which would read as
   * "nobody came" — a very different and much more alarming claim.
   */
  firstEventDay: string | null;
}

export interface AiUsagePoint {
  day: string;
  label: string;
  feature: string;
  calls: number;
  people: number;
}

/** Day labels are built from the date parts to sidestep timezone drift. */
const dayLabel = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, date ?? 1).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
};

export const fetchDailyActivity = async (
  days: number,
  cohortId?: string | null,
): Promise<DailyActivityPoint[]> => {
  const { data, error } = await supabase.rpc('activity_daily', {
    p_days: days,
    ...(cohortId ? { p_cohort_id: cohortId } : {}),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    day: row.day,
    label: dayLabel(row.day),
    views: Number(row.views) || 0,
    downloads: Number(row.downloads) || 0,
    aiCalls: Number(row.ai_calls) || 0,
    activeUsers: Number(row.active_users) || 0,
  }));
};

export const fetchTopSubjects = async (
  kind: 'view' | 'download',
  days: number,
  limit = 10,
  cohortId?: string | null,
): Promise<TopSubject[]> => {
  const { data, error } = await supabase.rpc('activity_top_subjects', {
    p_kind: kind,
    p_days: days,
    p_limit: limit,
    ...(cohortId ? { p_cohort_id: cohortId } : {}),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    subject: row.subject,
    subjectId: row.subject_id ?? null,
    events: Number(row.events) || 0,
    people: Number(row.people) || 0,
  }));
};

export const fetchActivityPulse = async (): Promise<ActivityPulse> => {
  const { data, error } = await supabase.rpc('activity_pulse');
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    viewsToday: Number(row?.views_today) || 0,
    downloadsToday: Number(row?.downloads_today) || 0,
    activeToday: Number(row?.active_today) || 0,
    viewsWeek: Number(row?.views_week) || 0,
    downloadsWeek: Number(row?.downloads_week) || 0,
    activeWeek: Number(row?.active_week) || 0,
    firstEventDay: row?.first_event_day ?? null,
  };
};

export const fetchAiUsage = async (days: number): Promise<AiUsagePoint[]> => {
  const { data, error } = await supabase.rpc('ai_usage_daily', { p_days: days });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    day: row.day,
    label: dayLabel(row.day),
    feature: row.feature,
    calls: Number(row.calls) || 0,
    people: Number(row.people) || 0,
  }));
};

/**
 * The feature keys the usage ledger stores, turned into the names staff use.
 *
 * These are the `system_settings` keys themselves: `ai-guard.ts` uses one name
 * for both the switch and the quota counter, so what lands in `ai_usage.feature`
 * is exactly the flag name. An unrecognised key is prettified rather than
 * dropped, so a feature added later still appears in the chart.
 */
const AI_FEATURE_LABELS: Record<string, string> = {
  ai_material_descriptions: 'Material descriptions',
  ai_question_drafting: 'Question drafting',
  ai_message_drafting: 'Message drafting',
  ai_essay_marking: 'Essay marking',
  ai_practice_quizzes: 'Practice quizzes',
  ai_progress_summary: 'Progress summaries',
  ai_result_guidance: 'Revision guidance',
  ai_study_assistant: 'Study assistant',
};

export const aiFeatureLabel = (feature: string): string =>
  AI_FEATURE_LABELS[feature] ??
  feature.replace(/^ai_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** AI calls per feature over the window, largest first, for a bar chart. */
export const aiUsageByFeature = (points: AiUsagePoint[]): { name: string; value: number }[] => {
  const totals = new Map<string, number>();
  points.forEach((point) => {
    const label = aiFeatureLabel(point.feature);
    totals.set(label, (totals.get(label) ?? 0) + point.calls);
  });
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

/** AI calls per day, summed across features, aligned to the daily chart. */
export const aiUsageByDay = (points: AiUsagePoint[]): { label: string; calls: number }[] => {
  const totals = new Map<string, { label: string; calls: number }>();
  points.forEach((point) => {
    const existing = totals.get(point.day);
    if (existing) existing.calls += point.calls;
    else totals.set(point.day, { label: point.label, calls: point.calls });
  });
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
};
