import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, File, Clock, CheckCircle2, AlertCircle, ClipboardList } from 'lucide-react';
import { Bar, EmptyCard, Panel, Pill, ScreenHeader, type Tone } from '@/components/redesign/student-pages/ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { calculateTimeRemaining, formatTimeRemaining, type TimeRemaining } from '@/lib/timer';
import { r2Storage } from '@/lib/r2-storage';

interface AssignmentWithSubmission extends Tables<'assignments'> {
  submission?: Tables<'assignment_submissions'> | null;
}

const StudentAssignments = () => {
  const { student } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentWithSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingAssignmentId, setUploadingAssignmentId] = useState<string | null>(null);
  const [timers, setTimers] = useState<Record<string, TimeRemaining>>({});
  const [, setUpdateTrigger] = useState(0);

  const loadAssignments = useCallback(async () => {
    if (!student?.cohort_id || !student?.id) return;
    try {
      setLoading(true);
      const [{ data: assignmentsData, error: aErr }, { data: submissionsData, error: sErr }] = await Promise.all([
        // Offline records hold marks for work already done onsite; there is
        // nothing here for a student to submit, so they stay off this page and
        // show up under Grades instead.
        supabase.from('assignments').select('*').eq('cohort_id', student.cohort_id).eq('is_manual_record', false).order('due_date', { ascending: true }),
        supabase.from('assignment_submissions').select('*').eq('student_id', student.id),
      ]);
      if (aErr) throw aErr;
      if (sErr) throw sErr;
      const submissionMap = new Map(submissionsData?.map((s) => [s.assignment_id, s]) || []);
      setAssignments((assignmentsData || []).map((a) => ({ ...a, submission: submissionMap.get(a.id) || null })));
    } catch (err) {
      console.error('Load assignments error:', err);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [student?.id, student?.cohort_id]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers: Record<string, TimeRemaining> = {};
      assignments.forEach((a) => { newTimers[a.id] = calculateTimeRemaining(a.due_date); });
      setTimers(newTimers);
      setUpdateTrigger((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [assignments]);


  const handleDownload = async (submission: Tables<'assignment_submissions'>) => {
    try {
      if (submission.storage_provider === 'r2') {
        const url = await r2Storage.getDownloadUrl(submission.storage_path || submission.file_url);
        window.open(url, '_blank');
      } else {
        window.open(`${submission.file_url}?download=`, '_blank');
      }
    } catch (err) {
      toast.error("Failed to get download link");
    }
  };

  const handleSubmit = async (assignmentId: string) => {
    if (!selectedFile || !student?.id) { toast.error('Please select a file'); return; }
    try {
      setSubmitting(assignmentId);
      const fileName = `assignments/${student.id}/${assignmentId}/${Date.now()}_${selectedFile.name}`;

      await r2Storage.uploadFile(selectedFile, fileName);
      const storageProvider = 'r2';
      const filePath = fileName;
      const fileUrl = fileName;

      const { error: insertError } = await supabase.from('assignment_submissions').insert({
        assignment_id: assignmentId, 
        student_id: student.id,
        file_url: fileUrl, 
        storage_path: filePath,
        storage_provider: storageProvider,
        submitted_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      toast.success('Assignment submitted successfully');
      setSelectedFile(null);
      setUploadingAssignmentId(null);
      await loadAssignments();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error('Failed to submit task');
    } finally {
      setSubmitting(null);
    }
  };

  const getStatus = (assignment: AssignmentWithSubmission) => {
    if (!assignment.submission) {
      const timer = timers[assignment.id];
      if (timer?.isExpired) return 'EXPIRED';
      return 'PENDING';
    }
    if (assignment.submission.reviewed_at) return 'GRADED';
    return 'SUBMITTED';
  };

  const submittedCount = assignments.filter(a => a.submission).length;
  const gradedCount = assignments.filter(a => a.submission?.reviewed_at).length;
  const pendingCount = assignments.filter(a => !a.submission && !timers[a.id]?.isExpired).length;
  const expiredCount = assignments.filter(a => !a.submission && timers[a.id]?.isExpired).length;
  const progressPercent = assignments.length > 0 ? Math.round((submittedCount / assignments.length) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading tasks" />
      </div>
    );
  }

  const formatDue = (d: Date) =>
    `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ScreenHeader title="Tasks" description="Coursework to submit, and how it was marked." />

      {/* Progress overview */}
      {assignments.length > 0 && (
        <Panel className="space-y-3 rounded-2xl px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <strong className="font-bold">Submitted</strong>
            <span className="text-muted-foreground">
              {submittedCount} of {assignments.length} · {progressPercent}%
            </span>
          </div>
          <Bar value={progressPercent} label={`Tasks submitted, ${progressPercent}%`} />
          <dl className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'To do', value: pendingCount, color: 'text-[#8A3F05] dark:text-amber-300' },
              { label: 'Submitted', value: submittedCount - gradedCount, color: 'text-[#3F1585] dark:text-violet-200' },
              { label: 'Graded', value: gradedCount, color: 'text-[#11603F] dark:text-emerald-300' },
              { label: 'Overdue', value: expiredCount, color: 'text-[#8E2A0A] dark:text-red-300' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col-reverse rounded-xl bg-muted/60 py-2">
                <dt className="text-[11px] font-semibold text-muted-foreground">{s.label}</dt>
                <dd className={cn('text-lg font-extrabold tracking-tight', s.color)}>{s.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}

      {/* Task list */}
      {assignments.length === 0 ? (
        <EmptyCard icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />} title="No tasks yet">
          When your lecturers set coursework it appears here.
        </EmptyCard>
      ) : (
        <ul className="space-y-2.5" aria-label="Tasks">
          {assignments.map((assignment) => {
            const status = getStatus(assignment);
            const timer = timers[assignment.id] || calculateTimeRemaining(assignment.due_date);
            const isDue = assignment.due_date ? new Date(assignment.due_date) : null;
            const urgent = status === 'PENDING' && timer?.isUrgent;

            const pill: { tone: Tone; label: string } =
              status === 'GRADED' ? { tone: 'success', label: 'Graded' }
              : status === 'SUBMITTED' ? { tone: 'info', label: 'Submitted' }
              : status === 'EXPIRED' ? { tone: 'danger', label: 'Overdue' }
              : urgent ? { tone: 'danger', label: 'Due soon' }
              : { tone: 'warning', label: 'To do' };

            const submission = assignment.submission;
            const maxPoints = assignment.max_points || 100;

            return (
              <li
                key={assignment.id}
                className={cn(
                  'flex flex-col gap-2 rounded-2xl border bg-card p-3.5',
                  urgent || status === 'EXPIRED' ? 'border-[#8E2A0A]/30 dark:border-red-400/30' : 'border-border',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 text-[15px] font-bold leading-snug text-foreground">{assignment.title}</h2>
                  <Pill tone={pill.tone}>
                    {(urgent || status === 'EXPIRED') && <AlertCircle className="h-3 w-3" aria-hidden="true" />}
                    {pill.label}
                  </Pill>
                </div>

                {isDue && (
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Due {formatDue(isDue)}</span>
                    {!submission && (
                      <span className={cn(urgent || status === 'EXPIRED' ? 'font-semibold text-[#8E2A0A] dark:text-red-300' : '')}>
                        · {formatTimeRemaining(timer || calculateTimeRemaining(assignment.due_date))}
                      </span>
                    )}
                  </p>
                )}
                {assignment.description && (
                  <p className="line-clamp-2 text-[13px] text-muted-foreground">{assignment.description}</p>
                )}

                {submission ? (
                  <div className="space-y-2 border-t border-border pt-2.5">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-[#157F5B] dark:text-emerald-400" aria-hidden="true" />
                      Submitted {new Date(submission.submitted_at || '').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {submission.grade != null && (
                      <p className="text-sm font-bold text-[#11603F] dark:text-emerald-300">
                        Score {submission.grade}/{maxPoints}
                        <span className="ml-1.5 text-xs font-semibold">
                          ({Math.round((submission.grade / maxPoints) * 100)}%)
                        </span>
                      </p>
                    )}
                    {submission.feedback && (
                      <p className="text-[13px] italic text-muted-foreground">
                        <span className="font-semibold not-italic text-foreground">Lecturer: </span>
                        {submission.feedback}
                      </p>
                    )}
                    {submission.file_url && (
                      <Button variant="outline" className="h-11 rounded-xl" onClick={() => handleDownload(submission)}>
                        <File className="mr-2 h-4 w-4" aria-hidden="true" /> Download my submission
                      </Button>
                    )}
                  </div>
                ) : (
                  <Dialog
                    open={uploadingAssignmentId === assignment.id}
                    onOpenChange={(open) => open ? setUploadingAssignmentId(assignment.id) : setUploadingAssignmentId(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        className="h-11 w-full rounded-xl font-bold sm:w-auto sm:self-start"
                        variant={status === 'EXPIRED' ? 'destructive' : 'default'}
                      >
                        <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                        {status === 'EXPIRED' ? 'Submit late' : 'Submit work'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Submit task</DialogTitle>
                        <DialogDescription>{assignment.title}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        {status === 'EXPIRED' && (
                          <div className="rounded-xl bg-[#FDE2D8] p-3 text-sm font-medium text-[#8E2A0A] dark:bg-red-500/15 dark:text-red-300">
                            The deadline has passed. This submission will be marked as late.
                          </div>
                        )}
                        <div>
                          <Label htmlFor={`task-file-${assignment.id}`}>Your file</Label>
                          <Input
                            id={`task-file-${assignment.id}`}
                            type="file"
                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                            className="mt-2 h-11"
                          />
                          {selectedFile && <p className="mt-2 text-sm text-muted-foreground">Selected: {selectedFile.name}</p>}
                        </div>
                        <Button
                          onClick={() => handleSubmit(assignment.id)}
                          disabled={submitting === assignment.id || !selectedFile}
                          className="h-11 w-full rounded-xl font-bold"
                          variant={status === 'EXPIRED' ? 'destructive' : 'default'}
                        >
                          {submitting === assignment.id
                            ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Uploading…</>)
                            : (<><Upload className="mr-2 h-4 w-4" aria-hidden="true" /> Submit</>)}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default StudentAssignments;
