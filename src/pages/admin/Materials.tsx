import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Upload, Pin, PinOff, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface UploadForm {
  title: string;
  description: string;
  cohort_id: string;
  file: FileList;
}

const AdminMaterials = () => {
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [materials, setMaterials] = useState<Tables<'course_materials'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isPinningId, setIsPinningId] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch } = useForm<UploadForm>({
    defaultValues: { title: '', description: '', cohort_id: '' },
  });

  const selectedCohort = watch('cohort_id');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: cohortsData } = await supabase.from('cohorts').select('*').order('name');
      if (cohortsData) setCohorts(cohortsData);

      const { data: mats } = await supabase.from('course_materials').select('*').order('created_at', { ascending: false });
      if (mats) setMaterials(mats);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: UploadForm) => {
    if (!data.cohort_id || !data.title) {
      toast.error('Please provide a title and cohort');
      return;
    }

    const file = data.file?.[0];
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    try {
      setIsUploading(true);
      const fileName = `materials/${data.cohort_id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('course-materials')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('course-materials').getPublicUrl(uploadData.path);

      const { error: insertError } = await supabase.from('course_materials').insert({
        cohort_id: data.cohort_id,
        title: data.title,
        description: data.description || null,
        file_url: urlData.publicUrl,
        is_paid: false,
        uploaded_by: null,
      });

      if (insertError) throw insertError;

      toast.success('Material uploaded successfully');
      reset();
      setIsModalOpen(false);
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Error uploading material');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMaterial = async (id: string) => {
    try {
      setIsDeletingId(id);
      const { error } = await supabase.from('course_materials').delete().eq('id', id);
      if (error) throw error;
      toast.success('Material deleted');
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Error deleting material');
    } finally {
      setIsDeletingId(null);
    }
  };

  const togglePin = async (id: string, currentPin: boolean | null) => {
    try {
      setIsPinningId(id);
      const { error } = await supabase.from('course_materials').update({ is_pinned: !currentPin }).eq('id', id);
      if (error) throw error;
      toast.success(currentPin ? 'Material unpinned' : 'Material pinned');
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Error updating pin status');
    } finally {
      setIsPinningId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Course Materials</h1>
          <p className="text-sm text-gray-600 mt-1">Upload and manage course materials for cohorts</p>
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload New Material
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload New Material</DialogTitle>
              <DialogDescription>
                Add a course material to the materials bucket for your cohort
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Chapter 1 Notes"
                  {...register('title', { required: true })}
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description"
                  {...register('description')}
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <Label htmlFor="cohort">Cohort *</Label>
                <Select value={selectedCohort} onValueChange={(val) => reset({ ...watch(), cohort_id: val })}>
                  <SelectTrigger id="cohort">
                    <SelectValue placeholder="Select a cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="file">File *</Label>
                <input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                  {...register('file', { required: true })}
                  className="block w-full text-sm border border-gray-300 rounded px-3 py-2"
                />
              </div>

              <Button type="submit" disabled={isUploading} className="w-full">
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload Material'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Materials</CardTitle>
          <CardDescription>Manage uploaded course materials</CardDescription>
        </CardHeader>
        <CardContent>
          {materials.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No materials uploaded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Cohort</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell>{m.cohort_id}</TableCell>
                      <TableCell>
                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        {m.file_url ? (
                          <a
                            href={m.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                          >
                            Open
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePin(m.id, m.is_pinned)}
                            disabled={isPinningId === m.id}
                            title={m.is_pinned ? 'Unpin material' : 'Pin material'}
                          >
                            {isPinningId === m.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : m.is_pinned ? (
                              <Pin className="h-4 w-4 text-amber-600" />
                            ) : (
                              <PinOff className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMaterial(m.id)}
                            disabled={isDeletingId === m.id}
                          >
                            {isDeletingId === m.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
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

export default AdminMaterials;
