import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import StudentLayout from '@/components/StudentLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const StudentAnnouncements = () => {
  const { student } = useAuth();
  const [announcements, setAnnouncements] = useState<Array<any>>([]);
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
      // Fetch announcements where target_cohort_id is null OR equals student's cohort
      const orQuery = cohortId ? `target_cohort_id.is.null,target_cohort_id.eq.${cohortId}` : `target_cohort_id.is.null`;
      const { data, error } = await supabase.from('announcements').select('*').or(orQuery).order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements((data as any) || []);
    } catch (err) {
      console.error('Load announcements error:', err);
      setError('Failed to load announcements. Please try again.');
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <StudentLayout><div className="flex items-center justify-center min-h-[200px]"><Loader2 className="h-8 w-8 animate-spin" /></div></StudentLayout>;
  }

  if (error) {
    return (
      <StudentLayout><div className="space-y-6 pb-6">
        <div>
          <h1 className="text-2xl font-bold">Notice Board</h1>
          <p className="text-sm text-gray-600 mt-1">Latest announcements for your cohort</p>
        </div>
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-destructive font-medium">{error}</p>
            <Button onClick={() => loadAnnouncements()} variant="outline" className="mt-4">Retry</Button>
          </CardContent>
        </Card>
      </div></StudentLayout>
    );
  }

  return (
    <StudentLayout><div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Notice Board</h1>
        <p className="text-sm text-gray-600 mt-1">Latest announcements for your cohort</p>
      </div>

      {announcements.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-gray-500 py-8">No announcements</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {announcements?.map((a) => (
            <Card key={a.id} className={`p-4 ${a.is_urgent ? 'border border-red-300 bg-red-50' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{a.body}</p>
                  <p className="text-xs text-gray-500 mt-2">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</p>
                </div>
                <div className="flex flex-col items-end">
                  {a.is_urgent && <Badge className="bg-red-100 text-red-800">URGENT</Badge>}
                  <div className="text-xs text-gray-500 mt-2">{a.target_cohort_id ? 'Cohort' : 'All Students'}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentAnnouncements;
