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
import { Loader2, Upload, Pin, PinOff, Trash2, ExternalLink, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const MATERIAL_TYPES = ['Notes', 'Slides', 'Handout', 'Worksheet', 'Reference', 'Video', 'Other'] as const;

interface UploadForm {
  title: string;
  description: string;
  cohort_id: string;
  course_id: string;
  material_type: string;
}

const AdminMaterials = () => {
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [courses, setCourses] = useState<Tables<'courses'>[]>([]);
  const [materials, setMaterials] = useState<Tables<'course_materials'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isPinningId, setIsPinningId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cohortFilter, setCohortFilter] = useState('all');

  // Share to cohort state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingMaterial, setSharingMaterial] = useState<Tables<'course_materials'> | null>(null);
  const [shareTargetCohort, setShareTargetCohort] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm<UploadForm>({
    defaultValues: { title: '', description: '', cohort_id: '', course_id: '', material_type: '' },
  });

  const selectedCohort = watch('cohort_id');
  const selectedCourse = watch('course_id');
  const selectedMaterialType = watch('material_type');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [{ data: cohortsData }, { data: coursesData }, { data: mats }] = await Promise.all([
        supabase.from('cohorts').select('*').order('name'),
        supabase.from('courses').select('*').order('title'),
        supabase.from('course_materials').select('*').order('created_at', { ascending: false }),
      ]);
      if (cohortsData) setCohorts(cohortsData);
      if (coursesData) setCourses(coursesData);
      if (mats) setMaterials(mats);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: UploadForm) => {
    if (!data.cohort_id || !data.course_id || !data.title) {
      toast.error('Please provide title, cohort, and course');
      return;
    }
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }
    try {
      setIsUploading(true);
      const fileName = `materials/${data.cohort_id}/${Date.now()}-${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('course-materials').upload(fileName, selectedFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('course-materials').getPublicUrl(uploadData.path);

      const { error: insertError } = await supabase.from('course_materials').insert({
        cohort_id: data.cohort_id,
        course_id: data.course_id,
        title: data.title,
        description: data.description || null,
        file_url: urlData.publicUrl,
        material_type: data.material_type || null,
        is_paid: false,
        uploaded_by: null,
      });
      if (insertError) throw insertError;

      toast.success('Material uploaded successfully');
      reset();
      setSelectedFile(null);
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

  const openShareModal = (material: Tables<'course_materials'>) => {
    setSharingMaterial(material);
    setShareTargetCohort('');
    setShareModalOpen(true);
  };

  const handleShare = async () => {
    if (!sharingMaterial || !shareTargetCohort) {
      toast.error('Please select a target cohort');
      return;
    }
    if (shareTargetCohort === sharingMaterial.cohort_id) {
      toast.error('Material already belongs to this cohort');
      return;
    }
    // Check if already shared to this cohort
    const existing = materials.find(
      m => m.file_url === sharingMaterial.file_url && m.cohort_id === shareTargetCohort
    );
    if (existing) {
      toast.error('This material is already shared with that cohort');
      return;
    }
    try {
      setIsSharing(true);
      const { error } = await supabase.from('course_materials').insert({
        cohort_id: shareTargetCohort,
        course_id: sharingMaterial.course_id,
        title: sharingMaterial.title,
        description: sharingMaterial.description,
        file_url: sharingMaterial.file_url,
        file_type: sharingMaterial.file_type,
        material_type: sharingMaterial.material_type,
        is_paid: sharingMaterial.is_paid,
        is_pinned: false,
        uploaded_by: sharingMaterial.uploaded_by,
      });
      if (error) throw error;
      toast.success('Material shared to cohort successfully');
      setShareModalOpen(false);
      setSharingMaterial(null);
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to share material');
    } finally {
      setIsSharing(false);
    }
  };

  if (loading) {
    return (<div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div>);
  }

  // Cohorts available to share to (exclude the material's current cohort)
  const shareableCohorts = sharingMaterial
    ? cohorts.filter(c => c.id !== sharingMaterial.cohort_id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Course Materials</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload and manage course materials for cohorts</p>
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload New Material</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
            <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
              <DialogTitle>Upload New Material</DialogTitle>
              <DialogDescription>Add a course material for a cohort</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div>
                <Label>Title *</Label>
                <Input placeholder="e.g., Chapter 1 Notes" {...register('title', { required: true })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea placeholder="Optional description" {...register('description')} className="min-h-[80px]" />
              </div>
              <div>
                <Label>Cohort *</Label>
                <Select value={selectedCohort} onValueChange={(val) => setValue('cohort_id', val)}>
                  <SelectTrigger><SelectValue placeholder="Select a cohort" /></SelectTrigger>
                  <SelectContent>
                    {cohorts.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Course *</Label>
                <Select value={selectedCourse} onValueChange={(val) => setValue('course_id', val)}>
                  <SelectTrigger><SelectValue placeholder="Select a course" /></SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Material Type</Label>
                <Select value={selectedMaterialType} onValueChange={(val) => setValue('material_type', val)}>
                  <SelectTrigger><SelectValue placeholder="Select type (optional)" /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File *</Label>
                <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="block w-full text-sm border border-border rounded px-3 py-2" />
              </div>
              <div className="sticky bottom-0 bg-background pt-4 border-t">
                <Button type="submit" disabled={isUploading} className="w-full">
                  {isUploading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>) : 'Upload Material'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Share to Cohort Dialog */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Material to Another Cohort</DialogTitle>
            <DialogDescription>
              This will make "<span className="font-medium text-foreground">{sharingMaterial?.title}</span>" available to another cohort without re-uploading the file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Target Cohort</Label>
              <Select value={shareTargetCohort} onValueChange={setShareTargetCohort}>
                <SelectTrigger><SelectValue placeholder="Select cohort to share with" /></SelectTrigger>
                <SelectContent>
                  {shareableCohorts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleShare} disabled={isSharing || !shareTargetCohort} className="w-full">
              {isSharing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sharing...</>) : (
                <><Share2 className="mr-2 h-4 w-4" /> Share to Cohort</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>All Materials</CardTitle>
              <CardDescription>Manage uploaded course materials</CardDescription>
            </div>
            <Select value={cohortFilter} onValueChange={setCohortFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by cohort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cohorts</SelectItem>
                {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const filtered = cohortFilter === 'all' ? materials : materials.filter(m => m.cohort_id === cohortFilter);
            return filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No materials found{cohortFilter !== 'all' ? ' for this cohort' : ''}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
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
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell>{cohorts.find(c => c.id === m.cohort_id)?.name || '—'}</TableCell>
                      <TableCell>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        {m.file_url ? (
                          <a href={`${m.file_url}?download=`} download className="flex items-center gap-1 text-primary hover:underline text-sm">
                            Download <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => openShareModal(m)} title="Share to another cohort">
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => togglePin(m.id, m.is_pinned)} disabled={isPinningId === m.id} title={m.is_pinned ? 'Unpin' : 'Pin'}>
                            {isPinningId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : m.is_pinned ? <Pin className="h-4 w-4 text-amber-600" /> : <PinOff className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteMaterial(m.id)} disabled={isDeletingId === m.id}>
                            {isDeletingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
          })()}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMaterials;
