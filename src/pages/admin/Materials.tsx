import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Upload } from 'lucide-react';
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

  const { register, handleSubmit, reset, watch } = useForm<UploadForm>({
    defaultValues: { title: '', description: '', cohort_id: '' },
  });

  const fileList = watch('file');

  useEffect(() => {
    const fetch = async () => {
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

    fetch();
  }, []);

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
      const fileName = `${data.cohort_id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('course-materials')
        .upload(fileName, file);

      if (uploadError) {
        console.error(uploadError);
        toast.error('Failed to upload file');
        return;
      }

      const { data: urlData } = supabase.storage.from('course-materials').getPublicUrl(uploadData.path);

      const { error: insertError } = await supabase.from('course_materials').insert({
        cohort_id: data.cohort_id,
        title: data.title,
        description: data.description || null,
        file_url: urlData.publicUrl,
        is_paid: false,
        uploaded_by: null,
      });

      if (insertError) {
        console.error(insertError);
        toast.error('Failed to record material');
        return;
      }

      toast.success('Material uploaded');
      reset();

      const { data: mats } = await supabase.from('course_materials').select('*').order('created_at', { ascending: false });
      if (mats) setMaterials(mats);
    } catch (e) {
      console.error(e);
      toast.error('Error uploading material');
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Course Materials</h1>
            <p className="text-sm text-gray-600">Upload and manage course materials</p>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload New Material</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload New Material</DialogTitle>
                <DialogDescription>Provide title, cohort and upload a file to the course-materials bucket.</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" {...register('title', { required: true })} />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" {...register('description')} />
                </div>

                <div>
                  <Label htmlFor="cohort">Cohort</Label>
                  <Select {...register('cohort_id') as any}>
                    <SelectTrigger id="cohort">
                      <SelectValue placeholder="Select cohort" />
                    </SelectTrigger>
                    <SelectContent>
                      {cohorts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="file">File</Label>
                  <input id="file" type="file" accept="image/*,application/pdf" {...register('file' as any, { required: true })} />
                </div>

                <Button type="submit" disabled={isUploading} className="w-full">
                  {isUploading ? 'Uploading...' : 'Upload'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Materials</CardTitle>
            <CardDescription>Recently uploaded course materials</CardDescription>
          </CardHeader>
          <CardContent>
            {materials.length === 0 ? (
              <p className="text-gray-500">No materials uploaded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Cohort</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materials.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.title}</TableCell>
                        <TableCell>{m.cohort_id}</TableCell>
                        <TableCell>{m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</TableCell>
                        <TableCell>
                          {m.file_url ? (
                            <a href={m.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Download</a>
                          ) : (
                            '—'
                          )}
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
    </AdminLayout>
  );
};

export default AdminMaterials;
