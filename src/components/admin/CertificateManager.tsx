import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, Award, UserCheck, Search } from 'lucide-react';
import { toast } from 'sonner';

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
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);
  const [cohortForm, setCohortForm] = useState<Partial<CohortSettings>>({});

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
        .not('pending_name_change', 'is', null);

      if (error) throw error;
      setPendingChanges((studentData as any) || []);
      
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
      const updates: any = { pending_name_change: null };
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
            <Award className="h-5 w-5" /> Global Certificate Settings
          </CardTitle>
          <CardDescription>
            Update information that appears on all student certificates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-sm">
            <Label htmlFor="grad-date">Graduation Date Text</Label>
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
            <p className="text-[11px] text-muted-foreground italic">
              * This will update the "DATE" field on the certificate for all students.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" /> Name Verification
              </CardTitle>
              <CardDescription>
                Review and approve student requests to change their names on certificates.
              </CardDescription>
            </div>
            <div className="relative w-64">
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
                  <TableHead>Current Name</TableHead>
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
                        <div className="text-xs text-muted-foreground">{change.profile?.email}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground italic">
                        {change.name_on_certificate || 'Not set'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-bold text-primary">
                          {change.pending_name_change}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleNameAction(change.id, 'reject')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                          onClick={() => handleNameAction(change.id, 'approve')}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
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
