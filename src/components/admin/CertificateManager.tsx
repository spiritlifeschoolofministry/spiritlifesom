import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, Award, UserCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { CohortCertificateDialog } from '@/components/admin/CohortCertificateDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PendingNameChange {
  id: string;
  profile_id: string;
  name_on_certificate: string;
  pending_name_change: string;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface CohortSettings {
  id: string;
  name: string;
  graduation_date: string | null;
  certificate_text_main: string | null;
  certificate_text_sub: string | null;
}

const CertificateManager = () => {
  const [globalDate, setGlobalDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingNameChange[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cohorts, setCohorts] = useState<CohortSettings[]>([]);
  const [editingCohort, setEditingCohort] = useState<CohortSettings | null>(null);

  useEffect(() => {
    loadCertificateData();
  }, []);

  const loadCertificateData = async () => {
    try {
      setLoading(true);
      
      // Load global date
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'global_graduation_date')
        .maybeSingle();
      
      if (settingsData?.value) {
        try {
          setGlobalDate(JSON.parse(settingsData.value as string));
        } catch {
          setGlobalDate(settingsData.value as string);
        }
      }

      // Load cohorts
      const { data: cohortData } = await supabase
        .from('cohorts')
        .select('id, name, graduation_date, certificate_text_main, certificate_text_sub')
        .order('name');
      
      if (cohortData) setCohorts(cohortData as CohortSettings[]);

      // Load pending name changes
      const { data: studentData, error } = await supabase
        .from('students')
        .select(`
          id, 
          profile_id, 
          name_on_certificate, 
          pending_name_change, 
          profile:profiles(first_name, last_name, email)
        `)
        .eq('is_staff_preview', false)
        .not('pending_name_change', 'is', null);

      if (error) throw error;
      setPendingChanges(studentData || []);
      
    } catch (err) {
      console.error('Error loading certificate data:', err);
      toast.error('Failed to load certificate management data');
    } finally {
      setLoading(false);
    }
  };

  const saveGlobalDate = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('system_settings')
        .upsert({ 
          key: 'global_graduation_date', 
          value: JSON.stringify(globalDate),
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      toast.success('Global graduation date updated');
    } catch (err) {
      console.error('Error saving global date:', err);
      toast.error('Failed to update graduation date');
    } finally {
      setSaving(false);
    }
  };

  const handleNameAction = async (studentId: string, action: 'approve' | 'reject') => {
    const student = pendingChanges.find(p => p.id === studentId);
    if (!student) return;

    try {
      const updates: TablesUpdate<'students'> = { pending_name_change: null };
      if (action === 'approve') {
        updates.name_on_certificate = student.pending_name_change;
      }

      const { error } = await supabase
        .from('students')
        .update(updates)
        .eq('id', studentId);

      if (error) throw error;
      
      toast.success(action === 'approve' ? 'Name change approved' : 'Name change rejected');
      
      // Notify student
      await supabase.from('notifications').insert({
        user_id: student.profile_id,
        title: action === 'approve' ? 'Name Change Approved' : 'Name Change Rejected',
        body: action === 'approve' 
          ? `Your certificate name has been updated to "${student.pending_name_change}".`
          : `Your request to change your certificate name has been rejected.`,
        type: 'certificate',
        link: '/student/certificate'
      });

      setPendingChanges(prev => prev.filter(p => p.id !== studentId));
    } catch (err) {
      console.error('Error handling name action:', err);
      toast.error('Failed to process name change');
    }
  };

  const filteredChanges = pendingChanges.filter(p => 
    `${p.profile?.first_name} ${p.profile?.last_name} ${p.profile?.email}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" /> Global Fallback Settings
          </CardTitle>
          <CardDescription>
            Default date used when a cohort doesn't have a specific graduation date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-sm">
            <Label htmlFor="grad-date">Fallback Graduation Date</Label>
            <div className="flex gap-2">
              <Input 
                id="grad-date" 
                value={globalDate} 
                onChange={(e) => setGlobalDate(e.target.value)}
                placeholder="e.g. 20th April, 2025"
              />
              <Button onClick={saveGlobalDate} disabled={saving}>
                {saving ? <Loader2 className="animate-spin h-4 w-4" /> : 'Update'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" /> Cohort Certificate Settings
          </CardTitle>
          <CardDescription>
            Graduation date, wording and signatories, per cohort. Each opens with a live preview
            of the certificate those settings produce.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Graduation Date</TableHead>
                  <TableHead className="hidden lg:table-cell">Wording</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((cohort) => (
                  <TableRow key={cohort.id}>
                    <TableCell className="font-medium">{cohort.name}</TableCell>
                    <TableCell>{cohort.graduation_date || 'Not set'}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="max-w-full lg:max-w-[320px]">
                        <p className="text-xs truncate">
                          {cohort.certificate_text_main || 'Default main text'}
                        </p>
                        {cohort.certificate_text_sub && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {cohort.certificate_text_sub}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditingCohort(cohort)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CohortCertificateDialog
        cohort={editingCohort}
        open={Boolean(editingCohort)}
        onOpenChange={(next) => !next && setEditingCohort(null)}
        onSaved={loadCertificateData}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" /> Name Verification
              </CardTitle>
              <CardDescription>
                Review and approve student requests to change their names on certificates.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search students..." 
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="hidden md:table-cell">Current Name</TableHead>
                  <TableHead>Requested Name</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChanges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      No pending name change requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChanges.map((change) => (
                    <TableRow key={change.id}>
                      <TableCell>
                        <div className="font-medium">{change.profile?.first_name} {change.profile?.last_name}</div>
                        <div className="break-anywhere text-xs text-muted-foreground">{change.profile?.email}</div>
                        <div className="text-xs italic text-muted-foreground md:hidden">
                          Now: {change.name_on_certificate || 'Not set'}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground italic md:table-cell">
                        {change.name_on_certificate || 'Not set'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-bold text-primary">
                          {change.pending_name_change}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reject Name Change?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to reject the name change request for <strong>{change.profile?.first_name} {change.profile?.last_name}</strong>?
                                They will be notified of the rejection.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleNameAction(change.id, 'reject')} className="bg-red-600 hover:bg-red-700">Reject</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              size="sm" 
                              className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Approve Name Change?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to approve <strong>"{change.pending_name_change}"</strong> as the new certificate name for <strong>{change.profile?.first_name} {change.profile?.last_name}</strong>?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleNameAction(change.id, 'approve')} className="bg-green-600 hover:bg-green-700">Approve</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CertificateManager;
