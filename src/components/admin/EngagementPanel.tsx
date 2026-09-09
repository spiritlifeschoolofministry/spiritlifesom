import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Eye, Inbox, Info, MousePointerClick, Sparkles, UserCheck } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  aiUsageByDay,
  aiUsageByFeature,
  fetchAiUsage,
  fetchDailyActivity,
  fetchTopSubjects,
  type AiUsagePoint,
  type DailyActivityPoint,
  type TopSubject,
} from '@/lib/engagement';

const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
};

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" />
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

/**
 * Engagement: how much the portal is actually used.
 *
 * Separate from the rest of Analytics because it answers a different kind of
 * question. Enrolment, fees and attendance are all counts of records the school
 * keeps anyway; these are counts of behaviour, and they only exist from the day
 * `activity_events` started recording — which is why an empty result here says
 * "nothing recorded yet" rather than drawing a flat line at zero, a chart that
 * would read as "nobody came".
 */
const EngagementPanel = ({ cohortId }: { cohortId?: string | null }) => {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyActivityPoint[]>([]);
  const [topPages, setTopPages] = useState<TopSubject[]>([]);
  const [topDownloads, setTopDownloads] = useState<TopSubject[]>([]);
  const [aiUsage, setAiUsage] = useState<AiUsagePoint[]>([]);

  const scope = cohortId && cohortId !== 'all' ? cohortId : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // AI usage comes from `ai_usage`, which is school-wide rather than per
      // cohort, so it is not scoped and is allowed to fail on its own without
      // taking the traffic charts down with it.
      const [dailyRows, pages, downloads, ai] = await Promise.all([
        fetchDailyActivity(days, scope),
        fetchTopSubjects('view', days, 10, scope),
        fetchTopSubjects('download', days, 10, scope),
        fetchAiUsage(days).catch(() => [] as AiUsagePoint[]),
      ]);
      setDaily(dailyRows);
      setTopPages(pages);
      setTopDownloads(downloads);
      setAiUsage(ai);
    } catch (err) {
      console.error('Engagement load failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load engagement data.');
    } finally {
      setLoading(false);
    }
  }, [days, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const sum = (key: keyof DailyActivityPoint) =>
      daily.reduce((acc, point) => acc + (Number(point[key]) || 0), 0);
    // Peak distinct users on any one day. Summing the daily figures would count
    // the same person once per day they visited, which is not "active users".
    const peakActive = daily.reduce((max, point) => Math.max(max, point.activeUsers), 0);
    return {
      views: sum('views'),
      downloads: sum('downloads'),
      aiCalls: sum('aiCalls'),
      peakActive,
      today: daily[daily.length - 1],
    };
  }, [daily]);

  const aiByFeature = useMemo(() => aiUsageByFeature(aiUsage), [aiUsage]);
  const aiByDay = useMemo(() => aiUsageByDay(aiUsage), [aiUsage]);

  /** True when nothing at all has been recorded in the window. */
  const noTraffic = !loading && !error && totals.views === 0 && totals.downloads === 0;

  const SUMMARY = [
    {
      title: 'Page views',
      value: totals.views.toLocaleString(),
      subtitle: totals.today ? `${totals.today.views.toLocaleString()} today` : '',
      icon: Eye,
      color: 'text-primary',
    },
    {
      title: 'Downloads',
      value: totals.downloads.toLocaleString(),
      subtitle: totals.today ? `${totals.today.downloads.toLocaleString()} today` : '',
      icon: Download,
      color: 'text-emerald-600',
    },
    {
      title: 'Busiest day',
      value: totals.peakActive.toLocaleString(),
      subtitle: 'people, at its peak',
      icon: UserCheck,
      color: 'text-blue-600',
    },
    {
      title: 'AI calls',
      value: totals.aiCalls
        ? totals.aiCalls.toLocaleString()
        : aiUsage.reduce((acc, point) => acc + point.calls, 0).toLocaleString(),
      subtitle: 'across every feature',
      icon: Sparkles,
      color: 'text-violet-600',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Engagement</h2>
          <p className="text-sm text-muted-foreground">
            Views, downloads and AI use across the portal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border bg-card p-0.5">
            {RANGES.map((range) => (
              <Button
                key={range.days}
                size="sm"
                variant={days === range.days ? 'secondary' : 'ghost'}
                className="h-7 px-2.5 text-xs"
                onClick={() => setDays(range.days)}
              >
                {range.label}
              </Button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadCSV(daily, 'daily_activity')}>
                Daily activity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(topPages, 'top_pages')}>
                Top pages
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(topDownloads, 'top_downloads')}>
                Top downloads
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadCSV(aiUsage, 'ai_usage')}>
                AI usage
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Engagement data unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {noTraffic && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Nothing recorded yet</AlertTitle>
          <AlertDescription>
            Views and downloads are counted from the moment this feature went live, so there is no
            history before then. Figures will fill in as staff and students use the portal.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SUMMARY.map((card) => (
          <Card key={card.title} className="border-border shadow-[var(--shadow-card)]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                <p className={`truncate text-xl font-bold ${card.color}`}>{card.value}</p>
                {card.subtitle && (
                  <p className="text-[10px] text-muted-foreground">{card.subtitle}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border shadow-[var(--shadow-card)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily views and downloads</CardTitle>
          <CardDescription>Every page opened and every file fetched, by day.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="engagementViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="engagementDownloads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                // A 90-day window has far more days than an axis can label.
                interval={days > 30 ? 6 : days > 7 ? 2 : 0}
              />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} className="fill-muted-foreground" />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Area
                type="monotone"
                dataKey="views"
                name="Views"
                stroke="hsl(var(--primary))"
                fill="url(#engagementViews)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="downloads"
                name="Downloads"
                stroke="hsl(var(--chart-2))"
                fill="url(#engagementDownloads)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily active people</CardTitle>
            <CardDescription>Distinct signed-in users each day.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  interval={days > 30 ? 6 : days > 7 ? 2 : 0}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} className="fill-muted-foreground" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="activeUsers"
                  name="People"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI use by feature</CardTitle>
            <CardDescription>Calls over the window, from the usage ledger.</CardDescription>
          </CardHeader>
          <CardContent>
            {aiByFeature.length === 0 ? (
              <EmptyState message="No AI calls recorded in this window" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={aiByFeature} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} className="fill-muted-foreground" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={130}
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" name="Calls" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MousePointerClick className="h-4 w-4 text-primary" /> Most visited pages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPages.length === 0 ? (
              <EmptyState message="No page views recorded in this window" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page</TableHead>
                      <TableHead className="text-center">Views</TableHead>
                      <TableHead className="text-center">People</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topPages.map((row) => (
                      <TableRow key={row.subject}>
                        <TableCell className="font-mono text-xs">{row.subject}</TableCell>
                        <TableCell className="text-center font-medium">{row.events}</TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {row.people}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4 text-emerald-600" /> Most downloaded files
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topDownloads.length === 0 ? (
              <EmptyState message="No downloads recorded in this window" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead className="text-center">Downloads</TableHead>
                      <TableHead className="text-center">People</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDownloads.map((row) => (
                      <TableRow key={row.subject}>
                        <TableCell className="max-w-[220px] truncate text-sm font-medium">
                          {row.subject}
                        </TableCell>
                        <TableCell className="text-center font-medium">{row.events}</TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {row.people}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {aiByDay.length > 0 && (
        <Card className="border-border shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI calls per day</CardTitle>
            <CardDescription>
              Watch this against the daily caps in{' '}
              <Badge variant="secondary" className="text-[10px]">
                AI settings
              </Badge>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={aiByDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  interval={days > 30 ? 6 : days > 7 ? 2 : 0}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} className="fill-muted-foreground" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="calls" name="Calls" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EngagementPanel;
