import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';
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

  // Timer update interval
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers: Record<string, TimeRemaining> = {};
      assignments.forEach((a) => {
        newTimers[a.id] = calculateTimeRemaining(a.due_date);
      });
      setTimers(newTimers);
      setUpdateTrigger((prev) => prev + 1); // Force re-render
    }, 1000);

    return () => clearInterval(interval);
  }, [assignments]);

  const loadAssignments = async () => {
    if (!student?.cohort_id || !student?.id) return;

    try {
      setLoading(true);
      // Fetch assignments for this cohort with student's submission if exists
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('assignments')
        .select('*')
        .eq('cohort_id', student.cohort_id)
        .order('due_date', { ascending: true });

      if (assignmentsError) throw assignmentsError;

      // Fetch submissions for this student
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('student_id', student.id);

      if (submissionsError) throw submissionsError;

      // Combine data
      const submissionMap = new Map(submissionsData?.map((s) => [s.assignment_id, s]) || []);
      const enriched = (assignmentsData || []).map((a) => ({
        ...a,
        submission: submissionMap.get(a.id) || null,
      }));

      setAssignments(enriched);
    } catch (err) {
      console.error('Load assignments error:', err);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (assignmentId: string) => {
    if (!selectedFile || !student?.id) {
      toast.error('Please select a file');
      return;
    }

    try {
      setSubmitting(assignmentId);

      // Upload file to assignments bucket
      const fileName = `${student.id}/${assignmentId}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('assignments')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from('assignments').getPublicUrl(fileName);
      const fileUrl = urlData?.publicUrl;

      // Check if submitted after deadline
      const assignment = assignments.find((a) => a.id === assignmentId);
      const timeRemaining = assignment?.due_date ? calculateTimeRemaining(assignment.due_date) : null;
      const isLate = timeRemaining?.isExpired || false;

      // Create submission record
      const { error: insertError } = await supabase.from('assignment_submissions').insert({
        assignment_id: assignmentId,
        student_id: student.id,
        file_url: fileUrl,
        submitted_at: new Date().toISOString(),
        status: isLate ? 'LATE' : 'SUBMITTED',
      });

      if (insertError) throw insertError;

      toast.success(isLate ? 'Assignment submitted late. Please note this may affect your grade.' : 'Assignment submitted successfully');
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
    return assignment.submission.status || 'SUBMITTED';
  };

  const getStatusBadge = (status: string, isUrgent?: boolean) => {
    switch (status) {
      case 'PENDING':
        return isUrgent ? (
          <Badge className="bg-red-100 text-red-800 border-red-300 animate-pulse">
            <AlertCircle className="w-3 h-3 mr-1" /> Due Soon
          </Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300">
            <Clock className="w-3 h-3 mr-1" /> Pending
          </Badge>
        );
      case 'EXPIRED':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Expired</Badge>;
      case 'SUBMITTED':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300"><Upload className="w-3 h-3 mr-1" /> Submitted</Badge>;
      case 'LATE':
        return <Badge variant="destructive"><Zap className="w-3 h-3 mr-1" /> Submitted Late</Badge>;
      case 'GRADED':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300"><CheckCircle2 className="w-3 h-3 mr-1" /> Graded</Badge>;
      default:
        return <Badge>{status}</Badge>;
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
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-3xl font-bold">Assignments</h1>
        <p className="text-sm text-gray-600 mt-1">View and submit your coursework</p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500 py-8">No assignments yet</p>
          </CardContent>
        </Card>
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
                      {assignment.description && (
                        <CardDescription className="mt-1">{assignment.description}</CardDescription>
                      )}
                    </div>
                    {getStatusBadge(status, timer?.isUrgent)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isDue && (
                    <div className={`p-3 rounded ${timer?.isUrgent ? 'bg-red-100 border border-red-300' : 'bg-gray-100 border border-gray-300'}`}>
                      <p className={`text-sm font-medium ${timer?.isUrgent ? 'text-red-900' : 'text-gray-700'}`}>
                        ⏱️ {formatTimeRemaining(timer || calculateTimeRemaining(assignment.due_date))}
                      </p>
                      <p className={`text-xs ${timer?.isUrgent ? 'text-red-700' : 'text-gray-600'} mt-1`}>
                        Due: {isDue.toLocaleDateString()} at {isDue.toLocaleTimeString()}
                      </p>
                    </div>
                  )}

                  {assignment.submission ? (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                      <p className="text-sm font-medium text-blue-900">Submitted Submission</p>
                      {assignment.submission.status === 'LATE' && (
                        <div className="bg-red-100 border border-red-300 rounded p-2">
                          <p className="text-xs font-medium text-red-800">⚠️ This submission was submitted after the deadline.</p>
                        </div>
                      )}
                      <p className="text-xs text-blue-700">
                        Submitted on {new Date(assignment.submission.submitted_at || '').toLocaleDateString()}
                      </p>
                      {assignment.submission.file_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={assignment.submission.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                            <File className="w-4 h-4" /> View Submission
                          </a>
                        </Button>
                      )}
                      {assignment.submission.feedback && (
                        <div className="mt-3 p-2 bg-white rounded text-sm">
                          <p className="font-medium text-gray-700">Feedback:</p>
                          <p className="text-gray-600">{assignment.submission.feedback}</p>
                        </div>
                      )}
                    </div>
                  ) : status === 'EXPIRED' ? (
                    <div className="bg-red-50 border border-red-300 rounded p-3 text-center">
                      <p className="text-sm font-medium text-red-800">This assignment deadline has passed.</p>
                      <p className="text-xs text-red-700 mt-1">You can submit, but it will be marked as LATE.</p>
                      <Dialog open={uploadingAssignmentId === assignment.id} onOpenChange={(open) => open ? setUploadingAssignmentId(assignment.id) : setUploadingAssignmentId(null)}>
                        <DialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="mt-2">
                            <Upload className="w-4 h-4 mr-2" /> Submit Late
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Submit Assignment</DialogTitle>
                            <DialogDescription>{assignment.title}</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="bg-red-50 border border-red-300 rounded p-3">
                              <p className="text-sm text-red-800 font-medium">⚠️ This submission will be marked as LATE</p>
                            </div>
                            <div>
                              <Label htmlFor="file">Select File</Label>
                              <Input
                                id="file"
                                type="file"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                className="mt-2"
                              />
                              {selectedFile && <p className="text-sm text-gray-600 mt-2">Selected: {selectedFile.name}</p>}
                            </div>
                            <Button
                              onClick={() => handleSubmit(assignment.id)}
                              disabled={submitting === assignment.id || !selectedFile}
                              variant="destructive"
                              className="w-full"
                            >
                              {submitting === assignment.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 mr-2" /> Submit Late
                                </>
                              )}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ) : (
                    <Dialog open={uploadingAssignmentId === assignment.id} onOpenChange={(open) => open ? setUploadingAssignmentId(assignment.id) : setUploadingAssignmentId(null)}>
                      <DialogTrigger asChild>
                        <Button className="w-full sm:w-auto">
                          <Upload className="w-4 h-4 mr-2" /> Upload Submission
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Submit Assignment</DialogTitle>
                          <DialogDescription>{assignment.title}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="file">Select File</Label>
                            <Input
                              id="file"
                              type="file"
                              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                              className="mt-2"
                            />
                            {selectedFile && <p className="text-sm text-gray-600 mt-2">Selected: {selectedFile.name}</p>}
                          </div>
                          <Button
                            onClick={() => handleSubmit(assignment.id)}
                            disabled={submitting === assignment.id || !selectedFile}
                            className="w-full"
                          >
                            {submitting === assignment.id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mr-2" /> Submit Assignment
                              </>
                            )}
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
  );
};

export default StudentAssignments;
