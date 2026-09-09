import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronRight, Download, Eye, Sparkles, Users } from 'lucide-react';
import { fetchActivityPulse, type ActivityPulse } from '@/lib/engagement';
import { useAiFlags } from '@/lib/ai-flags';

/**
 * Today's portal traffic, and whether the assistant is on.
 *
 * Deliberately three numbers and a link rather than a chart. A dashboard's job
 * is to say whether anything needs looking at; the charts that answer "why" are
 * one click away under Analytics, and duplicating them here would only mean two
 * places to keep in step.
 *
 * The AI row is here rather than buried in settings because the master switch
 * is the thing most worth noticing at a glance: every AI feature in the portal
 * is dark while it is off, and that is not visible from anywhere else a member
 * of staff routinely looks.
 */
const PortalPulse = () => {
  const [pulse, setPulse] = useState<ActivityPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { data: aiFlags } = useAiFlags();

  useEffect(() => {
    let live = true;
    fetchActivityPulse()
      .then((result) => {
        if (live) setPulse(result);
      })
      .catch(() => {
        // The dashboard's own figures are unaffected, so this degrades to a
        // hidden panel rather than an error banner over the whole page.
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;

  const stats = [
    {
      label: 'Views today',
      value: pulse?.viewsToday ?? 0,
      week: pulse?.viewsWeek ?? 0,
      icon: Eye,
      color: 'text-primary',
    },
    {
      label: 'Downloads today',
      value: pulse?.downloadsToday ?? 0,
      week: pulse?.downloadsWeek ?? 0,
      icon: Download,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'People today',
      value: pulse?.activeToday ?? 0,
      week: pulse?.activeWeek ?? 0,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
    },
  ];

  // No first event means nothing has ever been recorded, which is a different
  // thing from a quiet day and must not be shown as a row of zeros.
  const notRecordingYet = !loading && pulse !== null && pulse.firstEventDay === null;

  return (
    <Card className="border-border shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Portal activity</CardTitle>
        <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-primary">
          <Link to="/admin/analytics">
            Analytics <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : notRecordingYet ? (
          <p className="py-2 text-sm text-muted-foreground">
            Views and downloads are counted from now on. Figures appear here as staff and students
            use the portal.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg bg-secondary/50 p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Today
                  </span>
                </div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">
                  {stat.label.replace(' today', '')} · {stat.week.toLocaleString()} this week
                </p>
              </div>
            ))}
          </div>
        )}

        <Link
          to="/admin/ai"
          className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-secondary/50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {aiFlags?.assistantName ?? 'AI assistant'}
            </p>
            <p className="text-xs text-muted-foreground">
              {aiFlags?.enabled
                ? `${Object.values(aiFlags.features).filter(Boolean).length} of ${
                    Object.keys(aiFlags.features).length
                  } features on`
                : 'Switched off for the whole school'}
            </p>
          </div>
          <Badge variant={aiFlags?.enabled ? 'default' : 'secondary'} className="text-[10px]">
            {aiFlags?.enabled ? 'On' : 'Off'}
          </Badge>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  );
};

export default PortalPulse;
