import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, BookOpenCheck, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { useAiFlags } from '@/lib/ai-flags';
import { preloadPath } from '@/routes/lazy-pages';

/**
 * The way in to the assistant, on the dashboard.
 *
 * Renders nothing unless at least one of the two student-facing study features
 * is switched on — both ship off (see 20260909100000_ai_foundation.sql), and a
 * card advertising something a student cannot open is worse than no card.
 *
 * What it says is shaped by which features are actually on, so a student is
 * never invited to practise when practice is off. The copy names the assistant
 * and not a model or provider, which is the rule everywhere in the portal:
 * students are not meant to be reasoning about which gateway answered.
 */
export default function AssistantCard() {
  const { data: flags } = useAiFlags();

  const practiceOn = !!flags?.on('ai_practice_quizzes');
  const assistantOn = !!flags?.on('ai_study_assistant');
  if (!practiceOn && !assistantOn) return null;

  const name = flags?.assistantName ?? 'your assistant';

  const offers = [
    assistantOn && {
      icon: MessageCircleQuestion,
      text: 'Ask a question about your course materials',
    },
    practiceOn && {
      icon: BookOpenCheck,
      text: 'Practise with ungraded questions',
    },
  ].filter(Boolean) as { icon: typeof MessageCircleQuestion; text: string }[];

  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 via-primary/5 to-transparent shadow-md">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="text-base font-semibold text-foreground">Study with {name}</p>
              <Badge variant="secondary" className="text-[10px]">
                Not graded
              </Badge>
            </div>
            <ul className="mt-2 space-y-1">
              {offers.map((offer) => (
                <li key={offer.text} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <offer.icon className="h-3.5 w-3.5 shrink-0 text-violet-600/70 dark:text-violet-400/70" />
                  {offer.text}
                </li>
              ))}
            </ul>
          </div>
          <Link
            to="/student/study"
            onMouseEnter={() => preloadPath('/student/study')}
            onFocus={() => preloadPath('/student/study')}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            Open Study <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
