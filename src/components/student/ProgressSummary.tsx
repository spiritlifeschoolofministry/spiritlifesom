import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiFeature } from '@/lib/ai-flags';
import AssistantAttribution from '@/components/student/AssistantAttribution';
import { fetchProgressSummary } from '@/lib/ai-student';

/**
 * A student's own progress, in a few sentences, on their dashboard.
 *
 * Written once a day server-side and cached, so this costs one call however
 * many times the dashboard is opened.
 *
 * It renders nothing at all on failure — no error, no retry, no empty card.
 * A dashboard is the first thing a student sees, and every reason this could
 * fail (a spent free tier, no provider configured, the daily cap) is a reason
 * that means nothing to them and that they can do nothing about. The real
 * figures are on the same screen either way, so a missing paragraph costs
 * them nothing; an error message where a summary should be would just look
 * like the school's site is broken.
 */
export default function ProgressSummary() {
  const enabled = useAiFeature('ai_progress_summary');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let live = true;
    fetchProgressSummary()
      .then((result) => {
        if (live) setBody(result.body);
      })
      .catch(() => {
        // Deliberately silent. See the note above.
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [enabled]);

  if (!enabled) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </CardContent>
      </Card>
    );
  }

  if (!body) return null;

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardContent className="flex gap-3 pt-6">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-2">
          <p className="text-sm leading-relaxed">{body}</p>
          {/* The shared line, so this reads as the same assistant as the one
              beside a grade and the one under Study. */}
          <AssistantAttribution
            source="your own attendance, fees, tasks and exams"
            fallback="The figures on this page are the record; this is only a summary of them."
          />
        </div>
      </CardContent>
    </Card>
  );
}
