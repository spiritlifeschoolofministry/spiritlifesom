import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/portal/PageSkeleton';
import { Loader2, Sparkles } from 'lucide-react';
import { draftMessage } from '@/lib/ai-message';
import { useAiFeature } from '@/lib/ai-flags';
import { Trash2 } from 'lucide-react';
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

  // Drafting. `brief` is what the writer wants said, in their own words; the
  // figures come from the server. `facts` is kept so they can check them.
  const aiDrafting = useAiFeature('ai_message_drafting');
  const [brief, setBrief] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftFacts, setDraftFacts] = useState('');

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

  /**
   * Writes a draft into the body field.
   *
   * The title is only filled when it is empty — an admin who has already typed
   * one has decided what this announcement is called, and overwriting that
   * would be the AI taking a decision back off them.
   */
  const writeDraft = async () => {
    setDrafting(true);
    try {
      const draft = await draftMessage({
        kind: 'announcement',
        brief,
        cohortId: targetCohortId || null,
        subject: !title.trim(),
      });
      setBody(draft.body);
      setDraftFacts(draft.facts);
      if (draft.subject && !title.trim()) setTitle(draft.subject);
      toast.success(`Draft written by ${draft.provider ?? 'the model'} — edit it before posting.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not write a draft');
    } finally {
      setDrafting(false);
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

  if (loading) return <PageSkeleton />;

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
            {aiDrafting && (
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Draft it for me
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="What should it say? e.g. class moves to Saturday from next week"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={drafting}
                    onClick={writeDraft}
                    className="shrink-0"
                  >
                    {drafting
                      ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Writing…</>
                      : 'Write a draft'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The draft lands in the body below for you to edit. It uses the school's own
                  figures for the audience you have chosen, and invents nothing — anything it does
                  not know, it leaves out for you to add.
                </p>
                {draftFacts && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Figures this draft was given
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                      {draftFacts}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Body *</label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Announcement content" required rows={4} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium">Target Audience</label>
                <select value={targetCohortId} onChange={(e) => setTargetCohortId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">All Students</option>
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <Button type="submit" disabled={submitting} className="self-start">
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
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden lg:table-cell">Audience</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.title}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground lg:hidden">
                          <span className="sm:hidden">{a.category || 'GENERAL'} · </span>
                          {a.target_cohort_id ? 'Cohort' : 'All Students'}
                          <span className="md:hidden">{a.created_at ? ` · ${new Date(a.created_at).toLocaleDateString()}` : ''}</span>
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell"><Badge variant="secondary">{a.category || 'GENERAL'}</Badge></TableCell>
                      <TableCell className="hidden lg:table-cell">{a.target_cohort_id ? 'Cohort' : 'All Students'}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</TableCell>
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
