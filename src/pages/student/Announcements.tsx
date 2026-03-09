import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import StudentLayout from '@/components/StudentLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Megaphone, AlertTriangle, RefreshCw, Inbox } from 'lucide-react';
import { toast } from 'sonner';

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string | null;
  is_published: boolean | null;
  published_at: string | null;
  target_cohort_id: string | null;
  category: string | null;
  target_audience: string | null;
}

const CATEGORY_STYLES: Record<string, string> = {
  URGENT: 'bg-destructive/10 text-destructive border-destructive/30',
  GENERAL: 'bg-primary/10 text-primary border-primary/30',
  ACADEMIC: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  EVENT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

const StudentAnnouncements = () => {
  const { student } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    loadAnnouncements();
  }, [student?.cohort_id]);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!student) return;

      const cohortId = student.cohort_id;
      const orQuery = cohortId ? `target_cohort_id.is.null,target_cohort_id.eq.${cohortId}` : `target_cohort_id.is.null`;
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .or(orQuery)
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements((data as Announcement[]) || []);
    } catch (err) {
      console.error('Load announcements error:', err);
      setError('Failed to load announcements. Please try again.');
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  if (error) {
    return (
      <StudentLayout>
        <div className="space-y-6 pb-20 md:pb-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="w-7 h-7" /> Notice Board
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Stay updated with the latest announcements</p>
          </div>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-destructive/50" />
              <p className="text-destructive font-medium">{error}</p>
              <Button onClick={loadAnnouncements} variant="outline" className="mt-4 gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  const urgentAnnouncements = announcements.filter(a => a.category === 'URGENT');
  const regularAnnouncements = announcements.filter(a => a.category !== 'URGENT');

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="w-7 h-7" /> Notice Board
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Stay updated with the latest announcements
              {announcements.length > 0 && <span className="ml-1">· {announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAnnouncements} className="gap-2 self-start">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {announcements.length === 0 ? (
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="py-16 text-center">
              <Inbox className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h2 className="text-lg font-semibold text-foreground mb-1">No announcements yet</h2>
              <p className="text-muted-foreground text-sm">New announcements will appear here when published.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Urgent announcements pinned at top */}
            {urgentAnnouncements.length > 0 && (
              <div className="space-y-3">
                {urgentAnnouncements.map((a) => (
                  <Card key={a.id} className="border-destructive/30 bg-destructive/5 shadow-[var(--shadow-card)] overflow-hidden">
                    <div className="h-1 bg-destructive w-full" />
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center mt-0.5">
                          <AlertTriangle className="w-5 h-5 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <h3 className="font-bold text-foreground">{a.title}</h3>
                            <Badge variant="destructive" className="text-[10px] shrink-0">URGENT</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                          <div className="flex items-center gap-3 mt-3">
                            <span className="text-xs text-muted-foreground">
                              {a.published_at ? formatTime(a.published_at) : a.created_at ? formatTime(a.created_at) : ''}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {a.target_cohort_id ? '📌 Your Cohort' : '🌐 All Students'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Regular announcements */}
            {regularAnnouncements.map((a) => {
              const catStyle = CATEGORY_STYLES[a.category || 'GENERAL'] || CATEGORY_STYLES.GENERAL;
              return (
                <Card key={a.id} className="shadow-[var(--shadow-card)] border-border hover:shadow-md transition-shadow">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5 ${catStyle}`}>
                        <Megaphone className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{a.title}</h3>
                          {a.category && a.category !== 'GENERAL' && (
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${catStyle}`}>
                              {a.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="text-xs text-muted-foreground">
                            {a.published_at ? formatTime(a.published_at) : a.created_at ? formatTime(a.created_at) : ''}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {a.target_cohort_id ? '📌 Your Cohort' : '🌐 All Students'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentAnnouncements;
