import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Check, X, Plus, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import SiteContentEditor from '@/components/admin/SiteContentEditor';
import FacultyManager from '@/components/admin/FacultyManager';

interface SystemSettings {
  accepting_applications: boolean;
  school_name: string;
  school_logo_url: string;
}

interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  promoted_at: string | null;
  promoted_by: string | null;
}

interface StudentForPromotion {
  id: string;
  profile_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Cohort {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string | null;
}

const AdminSettings = () => {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({
    accepting_applications: true,
    school_name: 'Spirit Life School of Ministry',
    school_logo_url: '',
  });
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [students, setStudents] = useState<StudentForPromotion[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentForPromotion | null>(null);
  const [promoting, setPromoting] = useState(false);

  // Cohort management state
  const [showCreateCohortDialog, setShowCreateCohortDialog] = useState(false);
  const [newCohort, setNewCohort] = useState({ name: '', start_date: '', end_date: '' });
  const [creatingCohort, setCreatingCohort] = useState(false);
  const [deletingCohortId, setDeletingCohortId] = useState<string | null>(null);
  const [settingActiveCohortId, setSettingActiveCohortId] = useState<string | null>(null);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);
  const [deleteChallenge, setDeleteChallenge] = useState('');
  const [deleteInput, setDeleteInput] = useState('');

  // Pool of ~12-letter Bible words used for the deletion challenge
  const BIBLE_WORDS = [
    'RIGHTEOUSNESS', 'SANCTIFICATION', 'TRANSFIGURATION', 'LAMENTATIONS',
    'DEUTERONOMY', 'THESSALONIANS', 'PHILADELPHIA', 'NEBUCHADNEZZAR',
    'MELCHIZEDEK', 'JERUSALEM', 'BETHLEHEM', 'CORINTHIANS',
    'REVELATIONS', 'TABERNACLE', 'PRIESTHOOD', 'COVENANTAL',
    'INTERCESSION', 'REDEMPTION', 'GETHSEMANE', 'PENTECOSTAL',
  ];
  const pickChallengeWord = () => BIBLE_WORDS[Math.floor(Math.random() * BIBLE_WORDS.length)];

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadSettings(), loadAdminUsers(), loadStudents(), loadCohorts()]);
    setLoading(false);
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase.from('system_settings').select('key, value');
      if (error) throw error;

      const settingsMap: Record<string, string> = {};
      data?.forEach((s: any) => {
        const val = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
        settingsMap[s.key] = val;
      });

      const parseVal = (key: string, fallback: string) => {
        const raw = settingsMap[key];
        if (!raw) return fallback;
        try { return JSON.parse(raw); } catch { return raw; }
      };

      setSettings({
        accepting_applications: parseVal('accepting_applications', 'true') === true || parseVal('accepting_applications', 'true') === 'true',
        school_name: parseVal('school_name', 'Spirit Life School of Ministry'),
        school_logo_url: parseVal('school_logo_url', ''),
      });
    } catch (err) {
      console.error('Load settings error:', err);
      toast.error('Failed to load settings');
    }
  };

  const loadAdminUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, promoted_at, promoted_by')
        .eq('role', 'admin')
        .order('first_name');
      if (error) throw error;
      setAdminUsers((data as any) || []);
    } catch (err) {
      console.error('Load admins error:', err);
    }
  };

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`id, profile_id, profiles!students_profile_id_fkey ( id, email, first_name, last_name )`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const studentList = (data as any)?.map((s: any) => ({
        id: s.id,
        profile_id: s.profile_id,
        first_name: s.profiles?.first_name || '',
        last_name: s.profiles?.last_name || '',
        email: s.profiles?.email || '',
      })) || [];
      setStudents(studentList);
    } catch (err) {
      console.error('Load students error:', err);
    }
  };

  const loadCohorts = async () => {
    try {
      const { data, error } = await supabase
        .from('cohorts')
        .select('id, name, start_date, end_date, is_active, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCohorts((data as Cohort[]) || []);
    } catch (err) {
      console.error('Load cohorts error:', err);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      // Store accepting_applications as plain boolean (not JSON.stringify wrapped)
      const updates = [
        { key: 'accepting_applications', value: settings.accepting_applications },
        { key: 'school_name', value: settings.school_name },
        { key: 'school_logo_url', value: settings.school_logo_url },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('system_settings')
          .upsert({ key: update.key, value: update.value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
      }
      toast.success('Settings saved successfully');
    } catch (err) {
      console.error('Save settings error:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const promoteStudent = async () => {
    if (!selectedStudent || !profile) return;
    try {
      setPromoting(true);
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'admin', promoted_at: new Date().toISOString(), promoted_by: profile.id })
        .eq('id', selectedStudent.profile_id);
      if (error) throw error;
      toast.success(`${selectedStudent.first_name} promoted to Admin`);
      setShowPromoteDialog(false);
      setSelectedStudent(null);
      await Promise.all([loadAdminUsers(), loadStudents()]);
    } catch (err) {
      console.error('Promote student error:', err);
      toast.error('Failed to promote user');
    } finally {
      setPromoting(false);
    }
  };

  const createCohort = async () => {
    if (!newCohort.name || !newCohort.start_date || !newCohort.end_date) {
      toast.error('Please fill all cohort fields');
      return;
    }
    try {
      setCreatingCohort(true);
      const { error } = await supabase.from('cohorts').insert({
        name: newCohort.name,
        start_date: newCohort.start_date,
        end_date: newCohort.end_date,
        is_active: false,
        created_by: profile?.id,
      });
      if (error) throw error;
      toast.success('Cohort created successfully');
      setShowCreateCohortDialog(false);
      setNewCohort({ name: '', start_date: '', end_date: '' });
      await loadCohorts();
    } catch (err) {
      console.error('Create cohort error:', err);
      toast.error('Failed to create cohort');
    } finally {
      setCreatingCohort(false);
    }
  };

  const requestDeleteCohort = (cohort: Cohort) => {
    setCohortToDelete(cohort);
    setDeleteChallenge(pickChallengeWord());
    setDeleteInput('');
    setDeleteDialogOpen(true);
  };

  const confirmDeleteCohort = async () => {
    if (!cohortToDelete) return;
    if (deleteInput.trim().toUpperCase() !== deleteChallenge) {
      toast.error(`Please type "${deleteChallenge}" exactly to confirm deletion`);
      return;
    }
    try {
      setDeletingCohortId(cohortToDelete.id);
      const { error } = await supabase.from('cohorts').delete().eq('id', cohortToDelete.id);
      if (error) throw error;
      toast.success('Cohort deleted');
      setDeleteDialogOpen(false);
      setCohortToDelete(null);
      setDeleteInput('');
      await loadCohorts();
    } catch (err) {
      console.error('Delete cohort error:', err);
      toast.error('Failed to delete cohort. It may have students or data linked to it.');
    } finally {
      setDeletingCohortId(null);
    }
  };

  const setActiveCohort = async (cohortId: string) => {
    try {
      setSettingActiveCohortId(cohortId);
      // Deactivate currently active cohorts (filter on is_active, not a fake UUID).
      // The previous .neq('id','placeholder') failed UUID type-check and aborted the whole flow.
      const { error: deactivateError } = await supabase
        .from('cohorts')
        .update({ is_active: false })
        .eq('is_active', true);
      if (deactivateError) throw deactivateError;

      // Activate selected cohort
      const { error } = await supabase
        .from('cohorts')
        .update({ is_active: true })
        .eq('id', cohortId);
      if (error) throw error;

      toast.success('Active cohort updated');
      await loadCohorts();
    } catch (err) {
      console.error('Set active cohort error:', err);
      toast.error('Failed to set active cohort');
    } finally {
      setSettingActiveCohortId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage system configuration, cohorts, users, and branding</p>
      </div>

      {/* Enrollment Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Enrollment Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div>
              <Label className="text-base font-medium">Accepting New Applications</Label>
              <p className="text-sm text-muted-foreground mt-1">
                When turned off, the registration page will show "Admissions Closed"
              </p>
            </div>
            <Switch
              checked={settings.accepting_applications}
              onCheckedChange={(checked) => setSettings({ ...settings, accepting_applications: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cohort Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Cohort Management</CardTitle>
          <Button size="sm" onClick={() => setShowCreateCohortDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Cohort
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-4">No cohorts found</TableCell>
                  </TableRow>
                ) : (
                  cohorts.map((cohort) => (
                    <TableRow key={cohort.id}>
                      <TableCell className="font-medium">{cohort.name}</TableCell>
                      <TableCell>{new Date(cohort.start_date).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(cohort.end_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {cohort.is_active ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {!cohort.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveCohort(cohort.id)}
                            disabled={settingActiveCohortId === cohort.id}
                            className="gap-1"
                          >
                            {settingActiveCohortId === cohort.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                            Set Active
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => requestDeleteCohort(cohort)}
                          disabled={deletingCohortId === cohort.id || cohort.is_active}
                          className="gap-1"
                          title={cohort.is_active ? "Cannot delete active cohort" : "Delete cohort"}
                        >
                          {deletingCohortId === cohort.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          Delete
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

      {/* Portal Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portal Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="school-name">School Name</Label>
            <Input
              id="school-name"
              value={settings.school_name}
              onChange={(e) => setSettings({ ...settings, school_name: e.target.value })}
              placeholder="Enter school name"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">Displayed in the top-left of the sidebar and headers</p>
          </div>
          <div>
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              value={settings.school_logo_url}
              onChange={(e) => setSettings({ ...settings, school_logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">Link to your school logo image</p>
          </div>
          {settings.school_logo_url && (
            <div className="p-4 border rounded-lg bg-muted/50">
              <p className="text-sm font-medium mb-2">Preview</p>
              <img src={settings.school_logo_url} alt="Logo preview" className="h-12 w-auto" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Settings Button */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-base mb-4">Administrators</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Promoted At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminUsers?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4">No administrators found</TableCell>
                    </TableRow>
                  ) : (
                    adminUsers?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.first_name} {user.last_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell><Badge>{user.role}</Badge></TableCell>
                        <TableCell>{user.promoted_at ? new Date(user.promoted_at).toLocaleDateString() : 'System'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="pt-6 border-t">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Promote Student to Admin</h3>
              <Button onClick={() => setShowPromoteDialog(true)} variant="outline" size="sm">Promote User</Button>
            </div>
            <p className="text-sm text-muted-foreground">Select a student to promote them to administrator role with full system access.</p>
            <div className="mt-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded p-3">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">⚠️ Admins have full access to student data, settings, and can manage all system features.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Faculty CMS */}
      <FacultyManager />

      {/* Site Content CMS */}
      <SiteContentEditor />

      {/* Promote Dialog */}
      <Dialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Promote Student to Admin</DialogTitle>
            <DialogDescription>Select a student to grant administrator privileges</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {students?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No students available to promote</p>
            ) : (
              students?.map((student) => (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    selectedStudent?.id === student.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <p className="font-medium text-sm">{student.first_name} {student.last_name}</p>
                  <p className="text-xs text-muted-foreground">{student.email}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowPromoteDialog(false)}>Cancel</Button>
            <Button onClick={promoteStudent} disabled={!selectedStudent || promoting} className="gap-2">
              {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {promoting ? 'Promoting...' : 'Confirm Promotion'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Cohort Dialog */}
      <Dialog open={showCreateCohortDialog} onOpenChange={setShowCreateCohortDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Cohort</DialogTitle>
            <DialogDescription>Add a new cohort/class year</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cohort Name</Label>
              <Input
                placeholder="e.g. 2025/26"
                value={newCohort.name}
                onChange={(e) => setNewCohort({ ...newCohort, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={newCohort.start_date}
                onChange={(e) => setNewCohort({ ...newCohort, start_date: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={newCohort.end_date}
                onChange={(e) => setNewCohort({ ...newCohort, end_date: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowCreateCohortDialog(false)}>Cancel</Button>
            <Button onClick={createCohort} disabled={creatingCohort} className="gap-2">
              {creatingCohort ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creatingCohort ? 'Creating...' : 'Create Cohort'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSettings;
