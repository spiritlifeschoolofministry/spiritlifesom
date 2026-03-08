import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
import StudentLayout from '@/components/StudentLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, File, Clock, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
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
        assignment_id: assignmentId,
        student_id: student.id,
        file_url: urlData?.publicUrl,
        submitted_at: new Date().toISOString(),
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
    // Use reviewed_at to determine graded status
    if (assignment.submission.reviewed_at) return 'GRADED';
    return 'SUBMITTED';
  };

  const getStatusBadge = (status: string, isUrgent?: boolean) => {
    switch (status) {
      case 'PENDING':
        return isUrgent ? (
          <Badge className="bg-red-100 text-red-800 border-red-300 animate-pulse"><AlertCircle className="w-3 h-3 mr-1" /> Due Soon</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>
        );
      case 'EXPIRED':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Expired</Badge>;
      case 'SUBMITTED':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300"><Upload className="w-3 h-3 mr-1" /> Submitted</Badge>;
      case 'GRADED':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300"><CheckCircle2 className="w-3 h-3 mr-1" /> Graded</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (<StudentLayout><div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div></StudentLayout>);
  }

  return (
    <StudentLayout><div className="space-y-6 pb-6">
      <div>
        <h1 className="text-3xl font-bold">Assignments</h1>
        <p className="text-sm text-muted-foreground mt-1">View and submit your coursework</p>
      </div>

      {assignments.length === 0 ? (
        <Card><CardContent className="pt-6"><p className="text-center text-muted-foreground py-8">No assignments yet</p></CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => {
            const status = getStatus(assignment);
            const timer = timers[assignment.id] || calculateTimeRemaining(assignment.due_date);
            const isDue = assignment.due_date ? new Date(assignment.due_date) : null;

            return (
              <Card key={assignment.id} className={`overflow-hidden ${timer?.isUrgent && !assignment.submission ? 'border-red-300 bg-red-50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{assignment.title}</CardTitle>
                      {assignment.description && <CardDescription className="mt-1">{assignment.description}</CardDescription>}
                    </div>
                    {getStatusBadge(status, timer?.isUrgent)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isDue && (
                    <div className={`p-3 rounded ${timer?.isUrgent ? 'bg-red-100 border border-red-300' : 'bg-muted border'}`}>
                      <p className={`text-sm font-medium ${timer?.isUrgent ? 'text-red-900' : ''}`}>
                        ⏱️ {formatTimeRemaining(timer || calculateTimeRemaining(assignment.due_date))}
                      </p>
                      <p className={`text-xs ${timer?.isUrgent ? 'text-red-700' : 'text-muted-foreground'} mt-1`}>
                        Due: {isDue.toLocaleDateString()} at {isDue.toLocaleTimeString()}
                      </p>
                    </div>
                  )}

                  {assignment.submission ? (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                      <p className="text-sm font-medium text-blue-900">Submitted</p>
                      <p className="text-xs text-blue-700">Submitted on {new Date(assignment.submission.submitted_at || '').toLocaleDateString()}</p>
                      {assignment.submission.file_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={assignment.submission.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                            <File className="w-4 h-4" /> View Submission
                          </a>
                        </Button>
                      )}
                      {assignment.submission.grade != null && (
                        <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded">
                          <p className="text-sm font-semibold text-emerald-800">
                            Score: {assignment.submission.grade}/{assignment.max_points || 100}
                            <span className="ml-2 text-xs font-normal text-emerald-600">
                              ({Math.round((assignment.submission.grade / (assignment.max_points || 100)) * 100)}%)
                            </span>
                          </p>
                        </div>
                      )}
                      {assignment.submission.feedback && (
                        <div className="mt-2 p-2 bg-white rounded text-sm">
                          <p className="font-medium">Feedback:</p>
                          <p className="text-muted-foreground">{assignment.submission.feedback}</p>
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
                            <div className="bg-red-50 border border-red-300 rounded p-3">
                              <p className="text-sm text-red-800 font-medium">⚠️ This submission will be marked as late</p>
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
    </div></StudentLayout>
  );
};

export default StudentAssignments;
