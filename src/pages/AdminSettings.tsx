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
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

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

const AdminSettings = () => {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({
    accepting_applications: true,
    school_name: 'Spirit Life School of Ministry',
    school_logo_url: '',
  });
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [students, setStudents] = useState<StudentForPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentForPromotion | null>(null);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    loadSettings();
    loadAdminUsers();
    loadStudents();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase.from('system_settings').select('key, value');
      if (error) throw error;

      const settingsMap: Record<string, string> = {};
      data?.forEach((s) => {
        settingsMap[s.key] = s.value;
      });

      setSettings({
        accepting_applications: settingsMap['accepting_applications'] === 'true',
        school_name: settingsMap['school_name'] || 'Spirit Life School of Ministry',
        school_logo_url: settingsMap['school_logo_url'] || '',
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
      toast.error('Failed to load admin users');
    }
  };

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(
          `
          id,
          profile_id,
          profiles!students_profile_id_fkey (
            id,
            email,
            first_name,
            last_name
          )
        `
        )
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
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);

      const updates = [
        {
          key: 'accepting_applications',
          value: settings.accepting_applications ? 'true' : 'false',
          updated_by: profile?.id,
        },
        {
          key: 'school_name',
          value: settings.school_name,
          updated_by: profile?.id,
        },
        {
          key: 'school_logo_url',
          value: settings.school_logo_url,
          updated_by: profile?.id,
        },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('system_settings')
          .update({ value: update.value, updated_by: update.updated_by })
          .eq('key', update.key);

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
        .update({
          role: 'admin',
          promoted_at: new Date().toISOString(),
          promoted_by: profile.id,
        })
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
        <p className="text-sm text-gray-600 mt-1">Manage system configuration, users, and branding</p>
      </div>

      {/* Enrollment Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Enrollment Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
            <div>
              <Label className="text-base font-medium">Accepting New Applications</Label>
              <p className="text-sm text-gray-600 mt-1">
                When turned off, the signup link on the landing page will be hidden
              </p>
            </div>
            <Switch
              checked={settings.accepting_applications}
              onCheckedChange={(checked) => setSettings({ ...settings, accepting_applications: checked })}
            />
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
            <p className="text-xs text-gray-500 mt-1">Displayed in the top-left of the sidebar and headers</p>
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
            <p className="text-xs text-gray-500 mt-1">Link to your school logo image</p>
          </div>

          {settings.school_logo_url && (
            <div className="p-4 border rounded-lg bg-gray-50">
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
                      <TableCell colSpan={4} className="text-center text-gray-500 py-4">
                        No administrators found
                      </TableCell>
                    </TableRow>
                  ) : (
                    adminUsers?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.first_name} {user.last_name}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge>{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {user.promoted_at ? new Date(user.promoted_at).toLocaleDateString() : 'System'}
                        </TableCell>
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
              <Button onClick={() => setShowPromoteDialog(true)} variant="outline" size="sm">
                Promote User
              </Button>
            </div>

            <p className="text-sm text-gray-600">
              Select a student below to promote them to administrator role with full system access.
            </p>

            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-xs text-yellow-800">
                ⚠️ Admins have full access to student data, settings, and can manage all system features.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Promote Dialog */}
      <Dialog open={showPromoteDialog} onOpenChange={setShowPromoteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Promote Student to Admin</DialogTitle>
            <DialogDescription>Select a student to grant administrator privileges</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {students?.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No students available to promote</p>
            ) : (
              students?.map((student) => (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    selectedStudent?.id === student.id
                      ? 'border-primary bg-primary/10'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-sm">
                    {student.first_name} {student.last_name}
                  </p>
                  <p className="text-xs text-gray-600">{student.email}</p>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowPromoteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={promoteStudent}
              disabled={!selectedStudent || promoting}
              className="gap-2"
            >
              {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {promoting ? 'Promoting...' : 'Confirm Promotion'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSettings;
