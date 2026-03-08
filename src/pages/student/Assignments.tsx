import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import StudentLayout from '@/components/StudentLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, File, Clock, CheckCircle2, AlertCircle, ClipboardList, Send, Award } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { calculateTimeRemaining, formatTimeRemaining, type TimeRemaining } from '@/lib/timer';

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

  useEffect(() => {
    if (!student?.cohort_id) return;
    loadAssignments();
  }, [student?.cohort_id]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers: Record<string, TimeRemaining> = {};
      assignments.forEach((a) => { newTimers[a.id] = calculateTimeRemaining(a.due_date); });
      setTimers(newTimers);
      setUpdateTrigger((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [assignments]);

  const loadAssignments = async () => {
    if (!student?.cohort_id || !student?.id) return;
    try {
      setLoading(true);
      const [{ data: assignmentsData, error: aErr }, { data: submissionsData, error: sErr }] = await Promise.all([
        supabase.from('assignments').select('*').eq('cohort_id', student.cohort_id).order('due_date', { ascending: true }),
        supabase.from('assignment_submissions').select('*').eq('student_id', student.id),
      ]);
      if (aErr) throw aErr;
      if (sErr) throw sErr;
      const submissionMap = new Map(submissionsData?.map((s) => [s.assignment_id, s]) || []);
      setAssignments((assignmentsData || []).map((a) => ({ ...a, submission: submissionMap.get(a.id) || null })));
    } catch (err) {
      console.error('Load assignments error:', err);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (assignmentId: string) => {
    if (!selectedFile || !student?.id) { toast.error('Please select a file'); return; }
    try {
      setSubmitting(assignmentId);
      const fileName = `${student.id}/${assignmentId}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage.from('assignments').upload(fileName, selectedFile);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('assignments').getPublicUrl(fileName);
      const { error: insertError } = await supabase.from('assignment_submissions').insert({
        assignment_id: assignmentId, student_id: student.id,
        file_url: urlData?.publicUrl, submitted_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      toast.success('Assignment submitted successfully');
      setSelectedFile(null);
      setUploadingAssignmentId(null);
      await loadAssignments();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error('Failed to submit assignment');
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
      <StudentLayout>
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">View and submit your coursework</p>
        </div>

        {/* Progress Overview */}
        <Card className={`border-l-4 ${pendingCount === 0 && expiredCount === 0 && assignments.length > 0 ? 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : pendingCount > 0 ? 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-l-primary bg-primary/5'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Submission Progress</span>
              </div>
              <span className="text-sm font-bold text-primary">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2.5 mb-3" />
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {gradedCount} Graded</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> {submittedCount - gradedCount} Submitted</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {pendingCount} Pending</span>
              {expiredCount > 0 && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> {expiredCount} Expired</span>}
              <span className="text-muted-foreground ml-auto">{assignments.length} Total</span>
            </div>
          </CardContent>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Total</p>
              <p className="text-2xl font-bold text-foreground">{assignments.length}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Pending</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Submitted</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{submittedCount}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Graded</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{gradedCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Assignment List */}
        {assignments.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No assignments yet</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => {
              const status = getStatus(assignment);
              const timer = timers[assignment.id] || calculateTimeRemaining(assignment.due_date);
              const isDue = assignment.due_date ? new Date(assignment.due_date) : null;

              const borderColor = status === 'GRADED' ? 'border-l-emerald-500' : status === 'SUBMITTED' ? 'border-l-blue-500' : status === 'EXPIRED' ? 'border-l-red-500' : timer?.isUrgent ? 'border-l-red-500' : 'border-l-amber-500';
              const bgColor = status === 'GRADED' ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : status === 'SUBMITTED' ? 'bg-blue-50/50 dark:bg-blue-950/10' : status === 'EXPIRED' ? 'bg-red-50/50 dark:bg-red-950/10' : timer?.isUrgent ? 'bg-red-50/50 dark:bg-red-950/10' : '';

              const statusBadge = (() => {
                switch (status) {
                  case 'PENDING':
                    return timer?.isUrgent ? (
                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 animate-pulse"><AlertCircle className="w-3 h-3 mr-1" /> Due Soon</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>
                    );
                  case 'EXPIRED':
                    return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Expired</Badge>;
                  case 'SUBMITTED':
                    return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300"><Send className="w-3 h-3 mr-1" /> Submitted</Badge>;
                  case 'GRADED':
                    return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300"><Award className="w-3 h-3 mr-1" /> Graded</Badge>;
                  default:
                    return <Badge>{status}</Badge>;
                }
              })();

              return (
                <Card key={assignment.id} className={`border-l-4 ${borderColor} ${bgColor} transition-shadow hover:shadow-md`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base leading-tight">{assignment.title}</CardTitle>
                        {assignment.description && <CardDescription className="mt-1 line-clamp-2">{assignment.description}</CardDescription>}
                      </div>
                      {statusBadge}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isDue && (
                      <div className={`p-3 rounded-lg text-sm ${timer?.isUrgent && !assignment.submission ? 'bg-red-100 dark:bg-red-900/30 border border-red-300' : 'bg-muted/50 border border-border'}`}>
                        <p className={`font-medium ${timer?.isUrgent && !assignment.submission ? 'text-red-900 dark:text-red-300' : 'text-foreground'}`}>
                          ⏱️ {formatTimeRemaining(timer || calculateTimeRemaining(assignment.due_date))}
                        </p>
                        <p className={`text-xs mt-1 ${timer?.isUrgent && !assignment.submission ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>
                          Due: {isDue.toLocaleDateString()} at {isDue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    )}

                    {assignment.submission ? (
                      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Submitted on {new Date(assignment.submission.submitted_at || '').toLocaleDateString()}
                        </p>
                        {assignment.submission.file_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={`${assignment.submission.file_url}?download=`} download className="flex items-center gap-2">
                              <File className="w-4 h-4" /> Download Submission
                            </a>
                          </Button>
                        )}
                        {assignment.submission.grade != null && (
                          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                              Score: {assignment.submission.grade}/{assignment.max_points || 100}
                              <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                                ({Math.round((assignment.submission.grade / (assignment.max_points || 100)) * 100)}%)
                              </span>
                            </p>
                          </div>
                        )}
                        {assignment.submission.feedback && (
                          <div className="p-2.5 bg-card rounded-lg border text-sm">
                            <p className="font-medium text-foreground">Feedback:</p>
                            <p className="text-muted-foreground mt-0.5">{assignment.submission.feedback}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Dialog open={uploadingAssignmentId === assignment.id} onOpenChange={(open) => open ? setUploadingAssignmentId(assignment.id) : setUploadingAssignmentId(null)}>
                        <DialogTrigger asChild>
                          <Button className="w-full sm:w-auto" variant={status === 'EXPIRED' ? 'destructive' : 'default'}>
                            <Upload className="w-4 h-4 mr-2" /> {status === 'EXPIRED' ? 'Submit Late' : 'Upload Submission'}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Submit Assignment</DialogTitle>
                            <DialogDescription>{assignment.title}</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            {status === 'EXPIRED' && (
                              <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg p-3">
                                <p className="text-sm text-red-800 dark:text-red-300 font-medium">⚠️ This submission will be marked as late</p>
                              </div>
                            )}
                            <div>
                              <Label>Select File</Label>
                              <Input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="mt-2" />
                              {selectedFile && <p className="text-sm text-muted-foreground mt-2">Selected: {selectedFile.name}</p>}
                            </div>
                            <Button onClick={() => handleSubmit(assignment.id)} disabled={submitting === assignment.id || !selectedFile} className="w-full" variant={status === 'EXPIRED' ? 'destructive' : 'default'}>
                              {submitting === assignment.id ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>) : (<><Upload className="w-4 h-4 mr-2" /> Submit</>)}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
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

export default StudentAssignments;
