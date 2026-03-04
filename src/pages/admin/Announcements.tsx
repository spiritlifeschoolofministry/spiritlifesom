import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface AnnouncementForm {
  title: string;
  body: string;
  target_cohort_id: string;
  is_urgent: boolean;
}

const AdminAnnouncements = () => {
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset } = useForm<AnnouncementForm>({ defaultValues: { title: '', body: '', target_cohort_id: '', is_urgent: false } });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: cohortsData } = await supabase.from('cohorts').select('*').order('name');
      if (cohortsData) setCohorts(cohortsData as any);

      const { data: annData, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements((annData as any) || []);
    } catch (err) {
      console.error('Load announcements error:', err);
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const onCreate = async (values: AnnouncementForm) => {
    try {
      setSubmitting(true);
      const payload = {
        title: values.title,
        body: values.body,
        target_cohort_id: values.target_cohort_id || null,
        is_urgent: values.is_urgent || false,
      };
      const { error } = await supabase.from('announcements').insert(payload);
      if (error) throw error;
      toast.success('Announcement posted');
      reset();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]"><Loader2 className="h-8 w-8 animate-spin" /></div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-gray-600 mt-1">Post notices to cohorts or all students</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onCreate)} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input {...register('title', { required: true })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Body</label>
              <Textarea {...register('body', { required: true })} />
            </div>

            <div>
              <label className="text-sm font-medium">Target Audience</label>
              <Select {...(register('target_cohort_id') as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Students" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Students</SelectItem>
                  {cohorts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2"><input type="checkbox" {...register('is_urgent')} /> <span className="text-sm">Mark as URGENT</span></label>
              <Button type="submit" disabled={submitting}>{submitting ? 'Posting...' : 'Post Announcement'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <p className="text-sm text-gray-500">No announcements yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Urgent</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell>{a.target_cohort_id || 'All Students'}</TableCell>
                      <TableCell>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</TableCell>
                      <TableCell>{a.is_urgent ? 'Yes' : 'No'}</TableCell>
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
