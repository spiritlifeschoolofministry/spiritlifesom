import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { describeMaterial, suggestMaterialTags } from '@/lib/ai-material';
import { canExtractText as canRead, extractExcerpt } from '@/lib/pdf-excerpt';
import { useAiFeature, useAssistantName } from '@/lib/ai-flags';
import { isBlankText } from '@/lib/ai-format';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Upload, Pin, PinOff, Trash2, ExternalLink, Share2, Search, Sparkles, BookOpenText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { r2Storage } from '@/lib/r2-storage';
import { LearningModeSelect, LearningModeTags } from '@/components/admin/LearningModeSelect';
import { PageSkeleton } from '@/components/portal/PageSkeleton';
import { toModeArray } from '@/lib/learning-modes';

const MATERIAL_TYPES = ['Notes', 'Slides', 'Handout', 'Worksheet', 'Reference', 'Video', 'Other'] as const;

interface UploadForm {
  title: string;
  description: string;
  cohort_id: string;
  course_id: string;
  material_type: string;
  learning_modes: string[];
}

const AdminMaterials = () => {
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [courses, setCourses] = useState<Tables<'courses'>[]>([]);
  const [courseCohorts, setCourseCohorts] = useState<Tables<'course_cohorts'>[]>([]);
  const [materials, setMaterials] = useState<Tables<'course_materials'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isPinningId, setIsPinningId] = useState<string | null>(null);
  const [isCapturingId, setIsCapturingId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cohortFilter, setCohortFilter] = useState('all');
  // The opening words of the chosen file, read once when it is picked. Every AI
  // feature that touches this material later reads the stored copy instead.
  const [excerpt, setExcerpt] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const [writingDescription, setWritingDescription] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const aiDescriptions = useAiFeature('ai_material_descriptions');
  const assistantName = useAssistantName();
  const [searchQuery, setSearchQuery] = useState('');

  // Share to cohort state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingMaterial, setSharingMaterial] = useState<Tables<'course_materials'> | null>(null);
  const [shareTargetCohort, setShareTargetCohort] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm<UploadForm>({
    defaultValues: { title: '', description: '', cohort_id: '', course_id: '', material_type: '', learning_modes: ['All'] },
  });

  const selectedCohort = watch('cohort_id');
  const selectedCourse = watch('course_id');
  const selectedMaterialType = watch('material_type');
  const selectedLearningModes = watch('learning_modes');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [{ data: cohortsData }, { data: coursesData }, { data: mats }, { data: cc }] = await Promise.all([
        supabase.from('cohorts').select('*').order('name'),
        supabase.from('courses').select('*').order('title'),
        supabase.from('course_materials').select('*').order('created_at', { ascending: false }),
        supabase.from('course_cohorts').select('*'),
      ]);
      if (cohortsData) setCohorts(cohortsData);
      if (coursesData) setCourses(coursesData);
      if (cc) setCourseCohorts(cc || []);
      if (mats) setMaterials(mats);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (m) => {
    try {
      if (m.storage_provider === 'r2') {
        const url = await r2Storage.getDownloadUrl(m.storage_path || m.file_url);
        window.open(url, '_blank');
      } else {
        window.open(`${m.file_url}?download=`, '_blank');
      }
    } catch (err) {
      toast.error("Failed to get download link");
    }
  };

  /**
   * Capturing the text of a material that was uploaded before this existed.
   *
   * Text is normally read in the browser that holds the file at upload time,
   * which leaves every material uploaded before that day unreadable — and an
   * unreadable material is one the study assistant cannot offer at all, so the
   * student's picker sits empty however many materials the school has. This
   * fetches the stored file back, reads the same opening the uploader would
   * have, and stores it on the row. Nothing about the file itself changes.
   */
  const captureText = async (m: Tables<'course_materials'>) => {
    setIsCapturingId(m.id);
    try {
      const path = m.storage_path || m.file_url;
      if (!path) throw new Error('This material has no file to read.');

      // Through the edge function rather than from the file's own URL: R2's
      // signed endpoint sends no CORS headers, so the browser will not let the
      // page read the bytes however public the bucket is.
      const blob = m.storage_provider === 'r2'
        ? await r2Storage.getFileBlob(path)
        : await (async () => {
          const response = await fetch(m.file_url);
          if (!response.ok) throw new Error(`The file could not be fetched (${response.status}).`);
          return response.blob();
        })();
      const name = path.split('/').pop() || m.title;
      const file = new File([blob], name, { type: blob.type || 'application/pdf' });

      if (!canRead(file)) {
        toast.error('Only PDFs and text files can be read.');
        return;
      }

      const text = await extractExcerpt(file);
      // A scanned PDF has no text layer, and reports itself as empty rather
      // than as an error. Saying so is more use than saving an empty string.
      if (!text.trim()) {
        toast.error(`No text could be read — this is likely a scan, so ${assistantName} cannot answer from it.`);
        return;
      }

      const { error } = await supabase
        .from('course_materials')
        // Cast: `ai_excerpt` post-dates the generated types. See ai-db.ts.
        .update({ ai_excerpt: text } as Record<string, unknown>)
        .eq('id', m.id);
      if (error) throw error;

      setMaterials((prev) =>
        prev.map((row) =>
          row.id === m.id
            ? ({ ...row, ai_excerpt: text } as Tables<'course_materials'>)
            : row));
      toast.success(`${assistantName} can now answer from “${m.title}”.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Could not read that file');
    } finally {
      setIsCapturingId(null);
    }
  };

  /**
   * Reading the file's opening once, when it is picked.
   *
   * A PDF's words are only reachable in the browser holding it, so this is the
   * one moment they can be captured. The excerpt is stored on the row so that
   * describing it now, and drafting exam questions from it next month, both
   * read the same text without the file ever being uploaded twice.
   */
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setExcerpt('');
    if (!file) return;

    // A title the uploader hasn't typed is better guessed from the filename
    // than left empty — they can still change it.
    if (!watch('title')) {
      setValue('title', file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
    }

    if (!canRead(file)) return;
    setReadingFile(true);
    try {
      setExcerpt(await extractExcerpt(file));
    } finally {
      setReadingFile(false);
    }
  };

  /**
   * Writes the description, and files the material while it is at it.
   *
   * The two are one click because they are one decision: an uploader who wants
   * a description written wants the thing filed too, and asking twice for what
   * is always wanted is just an extra click. The tags are suggestions until the
   * material is saved — each one can be removed from the row of pills.
   */
  const writeDescription = async () => {
    const title = watch('title');
    if (!title) return;
    setWritingDescription(true);
    try {
      const meta = {
        title,
        courseName: courses.find((c) => c.id === watch('course_id'))?.title ?? null,
        materialType: watch('material_type') || null,
        fileType: selectedFile?.type || null,
        excerpt,
      };
      const [described, tagged] = await Promise.all([
        describeMaterial(meta),
        suggestMaterialTags(meta),
      ]);

      setValue('description', described.description);
      setSuggestedTags(tagged.tags);

      // A plain template sentence is a success, not a failure — but the uploader
      // should know why it reads flatly, and that they can improve it.
      if (described.note) toast.info(described.note);
      else toast.success(`${assistantName} wrote the description.`);
      if (tagged.note && tagged.tags.length === 0) toast.info(tagged.note);
    } finally {
      setWritingDescription(false);
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

      await r2Storage.uploadFile(selectedFile, fileName);
      const storageProvider = 'r2';
      const filePath = fileName;
      const fileUrl = fileName;

      const { error: insertError } = await supabase.from('course_materials').insert({
        cohort_id: data.cohort_id,
        course_id: data.course_id,
        title: data.title,
        description: data.description || null,
        file_url: fileUrl,
        storage_path: filePath,
        storage_provider: storageProvider,
        material_type: data.material_type || null,
        learning_modes: toModeArray(data.learning_modes),
        is_paid: false,
        uploaded_by: null,
        // Cast: `tags` and `ai_excerpt` post-date the generated types. See ai-db.ts.
        ...({ tags: suggestedTags, ai_excerpt: excerpt || null } as Record<string, unknown>),
      });
      if (insertError) throw insertError;

      toast.success('Material uploaded successfully');
      reset();
      setExcerpt('');
      setSuggestedTags([]);
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
      const material = materials.find(m => m.id === id);
      if (material) {
        if (material.storage_provider === 'r2') {
          await r2Storage.deleteFile(material.storage_path || material.file_url);
        } else {
          // Delete from R2 if we have storage_path
          if (material.storage_path) {
            await r2Storage.deleteFile(material.storage_path);
          }
        }
      }

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
        learning_modes: toModeArray(sharingMaterial.learning_modes),
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
    return <PageSkeleton />;
  }

  // Cohorts available to share to (exclude the material's current cohort)
  const shareableCohorts = sharingMaterial
    ? cohorts.filter(c => c.id !== sharingMaterial.cohort_id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Course Materials</h1>
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
                <div className="flex items-center justify-between gap-2">
                  <Label>Description</Label>
                  {aiDescriptions && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={writingDescription || !watch('title')}
                      onClick={writeDescription}
                      title={watch('title') ? `${assistantName} will write it` : 'Give it a title first'}
                    >
                      {writingDescription
                        ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Writing…</>
                        : <><Sparkles className="mr-1 h-3 w-3" /> {isBlankText(watch('description')) ? 'Write one' : 'Rewrite'}</>}
                    </Button>
                  )}
                </div>
                <Textarea placeholder="Optional description" {...register('description')} className="min-h-[80px]" />
                {suggestedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Filed under:</span>
                    {suggestedTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                        <button
                          type="button"
                          className="ml-1 hover:text-destructive"
                          onClick={() => setSuggestedTags((prev) => prev.filter((t) => t !== tag))}
                          aria-label={`Remove ${tag}`}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
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
                      {(() => {
                        const filteredCourses = courses.filter((c) => {
                          if (!selectedCohort) return true;
                          if (c.cohort_id === selectedCohort) return true;
                          return courseCohorts.some(cc => cc.course_id === c.id && cc.cohort_id === selectedCohort);
                        });
                        return filteredCourses.map((c) => (<SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>));
                      })()}
                    </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Learning Modes</Label>
                <LearningModeSelect
                  value={selectedLearningModes}
                  onChange={(modes) => setValue('learning_modes', modes)}
                />
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
                <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif" onChange={onPickFile} className="block w-full text-sm border border-border rounded px-3 py-2" />
                {readingFile && (
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Reading the opening pages…
                  </p>
                )}
                {!readingFile && excerpt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Read {excerpt.length.toLocaleString()} characters of text from this file.
                  </p>
                )}
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
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Input 
                  placeholder="Search materials..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="w-full sm:w-48 pl-8"
                />
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const filtered = materials
              .filter(m => (cohortFilter === 'all' || m.cohort_id === cohortFilter))
              .filter(m => (m.title.toLowerCase().includes(searchQuery.toLowerCase()) || (m.description || '').toLowerCase().includes(searchQuery.toLowerCase())))
              .sort((a, b) => {
                if (cohortFilter === 'all') {
                  const nameA = cohorts.find(c => c.id === a.cohort_id)?.name || '';
                  const nameB = cohorts.find(c => c.id === b.cohort_id)?.name || '';
                  return nameA.localeCompare(nameB);
                }
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
              });
            return filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No materials found{cohortFilter !== 'all' ? ' for this cohort' : ''}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden md:table-cell">Cohort</TableHead>
                    <TableHead className="hidden lg:table-cell">Mode</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.title}
                        {/* What the hidden columns held, folded under the title. */}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground lg:hidden">
                          <span className="md:hidden">{cohorts.find(c => c.id === m.cohort_id)?.name || '—'} · </span>
                          {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{cohorts.find(c => c.id === m.cohort_id)?.name || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <LearningModeTags modes={m.learning_modes} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        {m.file_url ? (
                          <button onClick={() => handleDownload(m)} className="flex items-center gap-1 text-primary hover:underline text-sm">
                            Download <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {!(m as { ai_excerpt?: string | null }).ai_excerpt && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => captureText(m)}
                              disabled={isCapturingId === m.id}
                              title={`Read this file's text so ${assistantName} can answer from it`}
                            >
                              {isCapturingId === m.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <BookOpenText className="h-4 w-4" />}
                            </Button>
                          )}
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
