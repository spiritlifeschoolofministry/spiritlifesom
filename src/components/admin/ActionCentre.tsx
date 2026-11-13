import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { preloadPath } from '@/routes/lazy-pages';
import { Panel } from '@/components/redesign/admin/primitives';

export interface ActionQueue {
  label: string;
  /** What one item in this queue is, for the singular/plural line. */
  noun: string;
  count: number;
  icon: LucideIcon;
  /** Where the work is actually done. */
  path: string;
  tone: 'amber' | 'sky' | 'violet' | 'emerald' | 'ink';
  /** The verb on the row's button ("Review", "Verify", "Mark"…). */
  cta?: string;
  /** One line under the label; defaults to "n things waiting". */
  detail?: string;
}

/** Count tiles from the AdminHome board: violet, amber, or ink for live work. */
const TONES: Record<ActionQueue['tone'], string> = {
  amber: 'bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  sky: 'bg-secondary text-secondary-foreground',
  violet: 'bg-secondary text-secondary-foreground',
  emerald: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  ink: 'bg-[#17112B] text-white dark:bg-[#2A1F4A]',
};

/**
 * Everything waiting on a member of staff, in one place, each row a link to
 * the page where that work is done — the "Needs you" inbox on the AdminHome
 * board.
 *
 * The dashboard used to add these queues together into a single
 * "Admissions/Requests" number. That told an admin something was waiting
 * without saying what or where — and certificate name changes were counted
 * into that figure while appearing nowhere on the page at all, so the only way
 * to find them was to already know they lived under Admissions.
 *
 * Nothing is approved from here. Each queue has a page that does it properly,
 * with the record in front of you; a second approve button on a dashboard row
 * is how a name change gets waved through without anyone reading it. So each
 * row's one explicit button opens that page.
 */
const ActionCentre = ({ queues, loading }: { queues: ActionQueue[]; loading?: boolean }) => {
  const outstanding = queues.filter((queue) => queue.count > 0);
  const total = outstanding.reduce((sum, queue) => sum + queue.count, 0);

  return (
    <Panel
      title="Needs you"
      titleId="needs-you-title"
      actions={
        !loading && total > 0 ? (
          <span className="text-[13px] text-muted-foreground">
            {total} waiting across {outstanding.length} {outstanding.length === 1 ? 'queue' : 'queues'}
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-2 p-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : outstanding.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600/70" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">Nothing waiting</p>
          <p className="text-[13px] text-muted-foreground">
            No admissions, requests or payments need a decision right now.
          </p>
        </div>
      ) : (
        <ul>
          {outstanding.map((queue) => {
            const cta = queue.cta ?? 'Open';
            return (
              <li
                key={queue.label}
                className="flex flex-wrap items-center gap-3.5 border-b border-border/60 px-5 py-3.5 last:border-b-0"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-extrabold ${TONES[queue.tone]}`}
                  aria-hidden="true"
                >
                  {queue.count}
                </span>
                <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                  <strong className="text-[15px] font-bold text-foreground">{queue.label}</strong>
                  <span className="text-[13px] text-muted-foreground">
                    {queue.detail ??
                      `${queue.count} ${queue.count === 1 ? queue.noun : `${queue.noun}s`} waiting`}
                  </span>
                </span>
                <Link
                  to={queue.path}
                  onMouseEnter={() => preloadPath(queue.path)}
                  onFocus={() => preloadPath(queue.path)}
                  aria-label={`${cta}: ${queue.label} (${queue.count})`}
                  className="inline-flex h-11 items-center rounded-[10px] bg-secondary px-3.5 text-sm font-bold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10"
                >
                  {cta}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};

export default ActionCentre;
