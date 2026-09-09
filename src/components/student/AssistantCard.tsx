import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAssistantContext } from '@/lib/assistant-places';
import { preloadPath } from '@/routes/lazy-pages';

/**
 * Who the assistant is, on the dashboard, once.
 *
 * This is the only place in the student portal that introduces him rather than
 * just using him. Everywhere else he appears mid-task — a paragraph above the
 * figures, a sparkle beside a grade, two tabs under Study — and a student
 * meeting those one at a time has no reason to think they are the same thing,
 * or to press the sparkle at all.
 *
 * So it names him, says he is theirs across the portal, and lists the places
 * he actually turns up, built from the live flags so it can never promise a
 * feature the school has switched off.
 *
 * Two things it states plainly rather than leaving to be discovered: nothing
 * he does is graded, and he works from that student's own record and materials
 * and nothing else. Both are the questions students actually have — a student
 * who suspects practice might count against them will not practise.
 */
export default function AssistantCard() {
  const { available, name, places, studyOn } = useAssistantContext();

  // Nothing is on, so there is nobody to introduce.
  if (!available) return null;

  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 via-primary/5 to-transparent shadow-md">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
                <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="text-base font-semibold text-foreground">
                Meet {name}, your study assistant
              </p>
              <Badge variant="secondary" className="text-[10px]">
                Never graded
              </Badge>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {name} helps you across the portal, working only from your own record and your own
              course materials. Look for the{' '}
              <Sparkles className="inline h-3 w-3 align-[-2px] text-violet-600 dark:text-violet-400" aria-hidden="true" />{' '}
              spark — that is {name}. Nothing he writes is a mark, and nothing you ask him is seen
              by your lecturers.
            </p>

            <ul className="mt-3 space-y-1.5">
              {places.map((place) => (
                <li key={place.feature} className="flex items-start gap-2 text-xs">
                  <place.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600/70 dark:text-violet-400/70" />
                  <span className="text-muted-foreground">
                    <Link
                      to={place.path}
                      onMouseEnter={() => preloadPath(place.path)}
                      onFocus={() => preloadPath(place.path)}
                      className="font-medium text-foreground/80 underline-offset-2 hover:underline"
                    >
                      {place.where}
                    </Link>{' '}
                    — {place.what}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Only where Study has something on it. The other two places are
              reached from the pages they belong to, not from here. */}
          {studyOn && (
            <Link
              to="/student/study"
              onMouseEnter={() => preloadPath('/student/study')}
              onFocus={() => preloadPath('/student/study')}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              Open Study <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
