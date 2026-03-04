import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Eye, File, CheckCircle2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface AssignmentFormData {
  title: string;
  description: string;
  due_date: string;
  cohort_id: string;
}

interface AssignmentWithSubmissions extends Tables<'assignments'> {
  submissions?: Array<Tables<'assignment_submissions'> & { student_profile?: any }>;
}

const AdminAssignments = () => {
  const [assignments, setAssignments] = useState<AssignmentWithSubmissions[]>([]);
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentWithSubmissions | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradingFeedback, setGradingFeedback] = useState('');
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState('');

  const { register, handleSubmit, reset, watch } = useForm<AssignmentFormData>({
    defaultValues: { title: '', description: '', due_date: '', cohort_id: '' },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: cohortsData } = await supabase.from('cohorts').select('*').order('name');
      if (cohortsData) setCohorts(cohortsData);

      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('*')
        .order('due_date', { ascending: false });
      if (assignmentsData) setAssignments(assignmentsData);
    } catch (err) {
      console.error('Load data error:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const onCreateAssignment = async (data: AssignmentFormData) => {
    if (!data.cohort_id) {
      toast.error('Please select a cohort');
      return;
    }

    try {
      setIsCreating(true);
      const { error } = await supabase.from('assignments').insert({
        title: data.title,
        description: data.description || null,
        due_date: data.due_date ? new Date(data.due_date).toISOString() : null,
        cohort_id: data.cohort_id,
      });

      if (error) throw error;
      toast.success('Assignment created');
      reset();
      await loadData();
    } catch (err) {
      console.error('Create error:', err);
      toast.error('Failed to create assignment');
    } finally {
      setIsCreating(false);
    }
  };

  const loadSubmissions = async (assignment: AssignmentWithSubmissions) => {
    try {
      setLoadingSubmissions(true);
      const { data: submissionsData } = await supabase
        .from('assignment_submissions')
        .select(`
          *,
          student_id(first_name, last_name, email)
        `)
        .eq('assignment_id', assignment.id)
        .order('submitted_at', { ascending: false });

      setSelectedAssignment({
        ...assignment,
        submissions: submissionsData as any,
      });
    } catch (err) {
      console.error('Load submissions error:', err);
      toast.error('Failed to load submissions');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleGradeSubmission = async (submissionId: string) => {
    if (!selectedAssignment) return;

    try {
      const { error } = await supabase
        .from('assignment_submissions')
        .update({
          status: 'GRADED',
          feedback: gradingFeedback || null,
          graded_at: new Date().toISOString(),
        })
        .eq('id', submissionId);

      if (error) throw error;
      toast.success('Submission graded');
      setGradingId(null);
      setGradingFeedback('');
      await loadSubmissions(selectedAssignment);
    } catch (err) {
      console.error('Grade error:', err);
      toast.error('Failed to grade submission');
    }
  };

  const handleUpdateDueDate = async (assignmentId: string) => {
    if (!editDueDate) {
      toast.error('Please select a due date');
      return;
    }

    try {
      const { error } = await supabase
        .from('assignments')
        .update({
          due_date: new Date(editDueDate).toISOString(),
        })
        .eq('id', assignmentId);

      if (error) throw error;
      toast.success('Due date updated');
      setEditingAssignmentId(null);
      setEditDueDate('');
      await loadData();
    } catch (err) {
      console.error('Update error:', err);
      toast.error('Failed to update due date');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Assignments</h1>
          <p className="text-sm text-gray-600 mt-1">Create and manage assignments for cohorts</p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Create Assignment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Assignment</DialogTitle>
              <DialogDescription>Add a new assignment for a cohort</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onCreateAssignment)} className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input {...register('title', { required: true })} placeholder="Assignment title" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea {...register('description')} placeholder="Assignment description" />
              </div>
              <div>
                <Label>Due Date *</Label>
                <Input type="datetime-local" {...register('due_date', { required: true })} />
              </div>
              <div>
                <Label>Cohort *</Label>
                <Select {...(register('cohort_id') as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cohort" />
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
              <Button type="submit" disabled={isCreating} className="w-full">
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" /> Create Assignment
                  </>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500 py-8">No assignments created yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Assignments ({assignments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Cohort</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => {
                    const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
                    return (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">{assignment.title}</TableCell>
                        <TableCell>{assignment.cohort_id}</TableCell>
                        <TableCell>{dueDate ? dueDate.toLocaleDateString() : 'No due date'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">0</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Dialog open={editingAssignmentId === assignment.id} onOpenChange={(open) => {
                              if (open) {
                                setEditingAssignmentId(assignment.id);
                                setEditDueDate(assignment.due_date ? new Date(assignment.due_date).toISOString().slice(0, 16) : '');
                              } else {
                                setEditingAssignmentId(null);
                                setEditDueDate('');
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Edit2 className="h-4 w-4 mr-1" /> Edit
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Due Date</DialogTitle>
                                  <DialogDescription>{assignment.title}</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="due-date-edit">New Due Date & Time</Label>
                                    <Input
                                      id="due-date-edit"
                                      type="datetime-local"
                                      value={editDueDate}
                                      onChange={(e) => setEditDueDate(e.target.value)}
                                      className="mt-2"
                                    />
                                  </div>
                                  <Button
                                    onClick={() => handleUpdateDueDate(assignment.id)}
                                    className="w-full"
                                  >
                                    Update Due Date
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>

                            <Dialog open={selectedAssignment?.id === assignment.id} onOpenChange={(open) => {
                              if (open) {
                                loadSubmissions(assignment);
                              } else {
                                setSelectedAssignment(null);
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="h-4 w-4 mr-1" /> View
                                </Button>
                              </DialogTrigger>
                            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>{selectedAssignment?.title}</DialogTitle>
                                <DialogDescription>
                                  Review student submissions and provide grades
                                </DialogDescription>
                              </DialogHeader>

                              {loadingSubmissions ? (
                                <div className="flex justify-center py-8">
                                  <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                              ) : selectedAssignment?.submissions && selectedAssignment.submissions.length > 0 ? (
                                <div className="space-y-4">
                                  {selectedAssignment.submissions.map((submission) => (
                                    <Card key={submission.id} className="border-l-4 border-l-blue-500">
                                      <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between">
                                          <div>
                                            <CardTitle className="text-base">
                                              {submission.student_id?.first_name} {submission.student_id?.last_name}
                                            </CardTitle>
                                            <p className="text-sm text-gray-600">{submission.student_id?.email}</p>
                                          </div>
                                          {submission.status === 'GRADED' ? (
                                            <Badge className="bg-emerald-100 text-emerald-800">
                                              <CheckCircle2 className="h-3 w-3 mr-1" /> Graded
                                            </Badge>
                                          ) : (
                                            <Badge className="bg-blue-100 text-blue-800">Submitted</Badge>
                                          )}
                                        </div>
                                      </CardHeader>
                                      <CardContent className="space-y-3">
                                        <p className="text-sm text-gray-600">
                                          Submitted: {new Date(submission.submitted_at || '').toLocaleString()}
                                        </p>
                                        {submission.file_url && (
                                          <Button variant="outline" size="sm" asChild>
                                            <a href={submission.file_url} target="_blank" rel="noopener noreferrer">
                                              <File className="h-4 w-4 mr-1" /> View Submission
                                            </a>
                                          </Button>
                                        )}

                                        {submission.status === 'GRADED' && submission.feedback && (
                                          <div className="bg-gray-50 p-3 rounded border border-gray-200">
                                            <p className="text-sm font-medium text-gray-700">Feedback:</p>
                                            <p className="text-sm text-gray-600 mt-1">{submission.feedback}</p>
                                          </div>
                                        )}

                                        {submission.status !== 'GRADED' && (
                                          <Dialog open={gradingId === submission.id} onOpenChange={(open) => {
                                            if (!open) {
                                              setGradingId(null);
                                              setGradingFeedback('');
                                            } else {
                                              setGradingId(submission.id);
                                            }
                                          }}>
                                            <DialogTrigger asChild>
                                              <Button size="sm" variant="outline">
                                                Grade & Provide Feedback
                                              </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                              <DialogHeader>
                                                <DialogTitle>Grade Submission</DialogTitle>
                                              </DialogHeader>
                                              <div className="space-y-4">
                                                <div>
                                                  <Label>Feedback</Label>
                                                  <Textarea
                                                    value={gradingFeedback}
                                                    onChange={(e) => setGradingFeedback(e.target.value)}
                                                    placeholder="Enter your feedback for the student..."
                                                    rows={4}
                                                  />
                                                </div>
                                                <Button
                                                  onClick={() => handleGradeSubmission(submission.id)}
                                                  className="w-full"
                                                >
                                                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Graded
                                                </Button>
                                              </div>
                                            </DialogContent>
                                          </Dialog>
                                        )}
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-center text-gray-500 py-8">No submissions yet</p>
                              )}
                            </DialogContent>
                          </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminAssignments;
