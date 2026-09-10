import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stethoscope } from 'lucide-react';
import {
  checkQuestions,
  ISSUE_LABELS,
  type HealthQuestion,
  type Issue,
} from '@/lib/question-health';

/**
 * What is wrong with a set of questions, checked rather than judged.
 *
 * No model, no call, no cost: every check is a rule over questions the page has
 * already loaded, so this is instant and cannot be wrong the way a model is
 * wrong. It reports and never edits — "the longest option is the answer" is
 * sometimes a giveaway and sometimes just how that answer had to be written,
 * and only the person who wrote it knows which.
 */
export const QuestionHealthPanel = ({
  questions,
  onOpen,
}: {
  questions: HealthQuestion[];
  /** Called with a question id when the reader wants to see one. */
  onOpen?: (id: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const issues = useMemo(() => checkQuestions(questions), [questions]);

  const byKind = useMemo(() => {
    const grouped = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!grouped.has(issue.kind)) grouped.set(issue.kind, []);
      grouped.get(issue.kind)!.push(issue);
    }
    return [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [issues]);

  const textOf = (id: string) =>
    questions.find((q) => q.id === id)?.question_text.replace(/<[^>]*>/g, ' ').trim() ?? '';

  if (questions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> Health
            </CardTitle>
            <CardDescription>
              {issues.length === 0
                ? `Nothing to flag across ${questions.length} questions.`
                : `${issues.length} thing${issues.length === 1 ? '' : 's'} worth a look across ${questions.length} questions. None of it is changed for you.`}
            </CardDescription>
          </div>
          {issues.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setOpen((was) => !was)}>
              {open ? 'Hide' : 'Show'}
            </Button>
          )}
        </div>

        {issues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {byKind.map(([kind, list]) => (
              <Badge key={kind} variant="secondary" className="text-[10px]">
                {ISSUE_LABELS[kind as keyof typeof ISSUE_LABELS]} · {list.length}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      {open && issues.length > 0 && (
        <CardContent className="space-y-3">
          {byKind.map(([kind, list]) => (
            <div key={kind} className="space-y-1.5">
              <p className="text-xs font-medium">
                {ISSUE_LABELS[kind as keyof typeof ISSUE_LABELS]}
              </p>
              <ul className="space-y-1">
                {list.slice(0, 12).map((issue, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <button
                      type="button"
                      className="text-left hover:underline text-foreground"
                      onClick={() => onOpen?.(issue.questionId)}
                    >
                      {textOf(issue.questionId).slice(0, 90) || 'Untitled question'}
                    </button>
                    <span className="block">{issue.detail}</span>
                    {issue.relatedId && (
                      <span className="block italic">
                        vs “{textOf(issue.relatedId).slice(0, 70)}”
                      </span>
                    )}
                  </li>
                ))}
                {list.length > 12 && (
                  <li className="text-xs text-muted-foreground">
                    …and {list.length - 12} more.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
};
