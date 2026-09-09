import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, LineChart, MessageCircleQuestion, Target } from 'lucide-react';
import { useAiFlags, type AiFeature } from '@/lib/ai-flags';

/**
 * Where the assistant turns up in the student portal, and what it does there.
 *
 * The portal grew four student-facing AI features, each switched on
 * independently and each naming the assistant in its own corner. From a
 * student's side that read as four unrelated things: a paragraph on the
 * dashboard, a sparkle button next to a grade, two tabs under Study. Nothing
 * said they were one assistant with one name, so nothing explained why the
 * sparkle on Grades was worth pressing.
 *
 * This is the single list they are all described from. A feature that is off
 * is left out rather than greyed: the student cannot turn it on, so naming it
 * only advertises something they cannot have.
 */

export interface AssistantPlace {
  feature: AiFeature;
  /** The page a student would go to, in the words the sidebar uses. */
  where: string;
  /** What it does there, in the second person. */
  what: string;
  icon: LucideIcon;
  path: string;
}

/**
 * Ordered the way a student meets them: the dashboard paragraph they cannot
 * miss, then the two things they choose to open, then the one that only exists
 * once results are out.
 */
const PLACES: AssistantPlace[] = [
  {
    feature: 'ai_progress_summary',
    where: 'Dashboard',
    what: 'sums up how you are doing, from your own record',
    icon: LineChart,
    path: '/student/dashboard',
  },
  {
    feature: 'ai_study_assistant',
    where: 'Study',
    what: 'answers questions about your course materials',
    icon: MessageCircleQuestion,
    path: '/student/study',
  },
  {
    feature: 'ai_practice_quizzes',
    where: 'Study',
    what: 'sets ungraded practice questions',
    icon: BookOpenCheck,
    path: '/student/study',
  },
  {
    feature: 'ai_result_guidance',
    where: 'Assessments',
    what: 'suggests what to revise once your results are released',
    icon: Target,
    path: '/student/grades',
  },
];

export interface AssistantContext {
  /** False when the master switch is off or every student feature is. */
  available: boolean;
  name: string;
  places: AssistantPlace[];
  /** True when Study has something on it, so a link there is worth offering. */
  studyOn: boolean;
}

export const useAssistantContext = (): AssistantContext => {
  const { data: flags } = useAiFlags();

  return useMemo(() => {
    const places = PLACES.filter((place) => !!flags?.on(place.feature));
    return {
      available: places.length > 0,
      name: flags?.assistantName ?? 'your assistant',
      places,
      studyOn: places.some(
        (place) =>
          place.feature === 'ai_study_assistant' || place.feature === 'ai_practice_quizzes',
      ),
    };
  }, [flags]);
};
