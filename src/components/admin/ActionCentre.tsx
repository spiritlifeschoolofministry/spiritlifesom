import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, CheckCircle2, ClipboardList } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { preloadPath } from '@/routes/lazy-pages';

export interface ActionQueue {
  label: string;
  /** What one item in this queue is, for the singular/plural line. */
  noun: string;
  count: number;
  icon: LucideIcon;
  /** Where the work is actually done. */
  path: string;
  tone: 'amber' | 'sky' | 'violet' | 'emerald';
}

const TONES: Record<ActionQueue['tone'], { bg: string; text: string }> = {
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400' },
  sky: { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-600 dark:text-sky-400' },
  violet: {
    bg: 'bg-violet-100 dark:bg-violet-900/40',
    text: 'text-violet-600 dark:text-violet-400',
  },
  emerald: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
};

/**
 * Everything waiting on a member of staff, in one place, each row a link to
 * the page where that work is done.
 *
 * The dashboard used to add these queues together into a single
 * "Admissions/Requests" number. That told an admin something was waiting
 * without saying what or where — and certificate name changes were counted
 * into that figure while appearing nowhere on the page at all, so the only way
 * to find them was to already know they lived under Admissions.
 *
 * Nothing is approved from here. Each queue has a page that does it properly,
 * with the record in front of you; a second approve button on a dashboard row
 * is how a name change gets waved through without anyone reading it.
 */
const ActionCentre = ({ queues, loading }: { queues: ActionQueue[]; loading?: boolean }) => {
  const outstanding = queues.filter((queue) => queue.count > 0);
  const total = outstanding.reduce((sum, queue) => sum + queue.count, 0);

  return (
    <Card className="border-border shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" /> Needs your attention
        </CardTitle>
        {!loading && total > 0 && (
          <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
            {total}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : outstanding.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500/70" />
            <p className="text-sm font-medium text-foreground">Nothing waiting</p>
            <p className="text-xs text-muted-foreground">
              No admissions, requests or payments need a decision right now.
            </p>
          </div>
        ) : (
          outstanding.map((queue) => {
            const tone = TONES[queue.tone];
            return (
              <Link
                key={queue.label}
                to={queue.path}
                onMouseEnter={() => preloadPath(queue.path)}
                onFocus={() => preloadPath(queue.path)}
                className="flex items-center gap-3 rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.bg}`}
                >
                  <queue.icon className={`h-4 w-4 ${tone.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{queue.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {queue.count} {queue.count === 1 ? queue.noun : `${queue.noun}s`} waiting
                  </p>
                </div>
                <span className={`text-lg font-bold ${tone.text}`}>{queue.count}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default ActionCentre;
