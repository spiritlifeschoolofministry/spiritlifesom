import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const AdminAnnouncements = () => {
  const { profile } = useAuth();
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [announcements, setAnnouncements] = useState<Tables<'announcements'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [targetCohortId, setTargetCohortId] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [{ data: cohortsData }, { data: annData, error }] = await Promise.all([
        supabase.from('cohorts').select('*').order('name'),
        supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      ]);
      if (error) throw error;
      if (cohortsData) setCohorts(cohortsData);
      setAnnouncements(annData || []);
    } catch (err) {
      console.error('Load announcements error:', err);
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        title: title.trim(),
        body: body.trim(),
        category,
        target_cohort_id: targetCohortId || null,
        created_by: profile?.id || null,
        is_published: true,
        published_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('announcements').insert(payload);
      if (error) throw error;
      toast.success('Announcement posted');
      setTitle('');
      setBody('');
      setCategory('GENERAL');
      setTargetCohortId('');
      await loadData();
    } catch (err) {
      console.error('Create announcement error:', err);
      toast.error('Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      toast.success('Announcement deleted');
      await loadData();
    } catch (err) {
      console.error('Delete announcement error:', err);
      toast.error('Failed to delete announcement');
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[200px]"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-muted-foreground mt-1">Post notices to cohorts or all students</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Create Announcement</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Title *</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" required />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="GENERAL">General</option>
                  <option value="URGENT">Urgent</option>
                  <option value="ACADEMIC">Academic</option>
                  <option value="EVENT">Event</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Body *</label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Announcement content" required rows={4} />
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium">Target Audience</label>
                <select value={targetCohortId} onChange={(e) => setTargetCohortId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">All Students</option>
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Posting...' : 'Post Announcement'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Announcements</CardTitle></CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell><Badge variant="secondary">{a.category || 'GENERAL'}</Badge></TableCell>
                      <TableCell>{a.target_cohort_id ? 'Cohort' : 'All Students'}</TableCell>
                      <TableCell>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(a.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
  );
};

export default AdminAnnouncements;
