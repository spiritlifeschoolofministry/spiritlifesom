import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';

interface PersonalFormData {
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const AdminProfile = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [courseCount, setCourseCount] = useState(0);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const { register: registerPersonal, handleSubmit: handlePersonalSubmit, formState: { errors: personalErrors }, reset: resetPersonal } = useForm<PersonalFormData>({
    defaultValues: { first_name: profile?.first_name || '', last_name: profile?.last_name || '', middle_name: profile?.middle_name || '', phone: profile?.phone || '' },
  });

  const { register: registerPassword, handleSubmit: handlePasswordSubmit, formState: { errors: passwordErrors }, reset: resetPassword, watch } = useForm<PasswordFormData>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const newPassword = watch('newPassword');

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        setLoading(true);
        const [{ count: studentsCount }, { count: coursesCount }] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('courses').select('*', { count: 'exact', head: true }),
        ]);
        setStudentCount(studentsCount || 0);
        setCourseCount(coursesCount || 0);
      } catch (error) {
        console.error('Error fetching admin stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminStats();
  }, []);

  useEffect(() => {
    if (profile) {
      resetPersonal({ first_name: profile.first_name || '', last_name: profile.last_name || '', middle_name: profile.middle_name || '', phone: profile.phone || '' });
      setAvatarPreview(profile.avatar_url || null);
    }
  }, [profile, resetPersonal]);

  const onPersonalSubmit = async (data: PersonalFormData) => {
    if (!user) return;
    try {
      setIsSavingPersonal(true);
      const { error } = await supabase.from('profiles').update({ first_name: data.first_name, last_name: data.last_name, middle_name: data.middle_name, phone: data.phone }).eq('id', user.id);
      if (error) throw error;
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  const uploadAvatar = async () => {
    if (!user || !avatarFile) return;
    try {
      setIsUploadingAvatar(true);
      const filePath = `avatars/${user.id}/${Date.now()}_${avatarFile.name}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, avatarFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const { error } = await supabase.from('profiles').update({ avatar_url: publicData.publicUrl }).eq('id', user.id);
      if (error) throw error;
      toast.success('Avatar uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
      setAvatarFile(null);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    if (data.newPassword !== data.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (data.newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      setIsSavingPassword(true);
      const { error } = await supabase.auth.updateUser({ password: data.newPassword });
      if (error) throw error;
      toast.success('Password changed successfully');
      resetPassword();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const initials = profile ? `${(profile.first_name || 'A')[0]}${(profile.last_name || 'U')[0]}` : 'AU';

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
            {avatarPreview && <AvatarImage src={avatarPreview} alt="Profile" />}
            <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <input id="avatar" type="file" accept="image/*" onChange={handleAvatarChange} />
            <Button onClick={uploadAvatar} disabled={isUploadingAvatar || !avatarFile}>
              {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
            </Button>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                {profile ? `${profile.first_name} ${profile.last_name}` : 'Administrator'}
              </h1>
              <p className="text-muted-foreground mt-1">{profile?.email}</p>
            </div>
            <Badge className="w-fit bg-primary text-primary-foreground uppercase">{profile?.role || 'Admin'}</Badge>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Total Students</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-bold">{studentCount}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Total Courses</CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-bold">{courseCount}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your profile details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePersonalSubmit(onPersonalSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>First Name</Label>
                    <Input {...registerPersonal('first_name', { required: 'First name is required' })} className="mt-1" />
                    {personalErrors.first_name && <p className="text-sm text-destructive mt-1">{personalErrors.first_name.message}</p>}
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input {...registerPersonal('last_name', { required: 'Last name is required' })} className="mt-1" />
                    {personalErrors.last_name && <p className="text-sm text-destructive mt-1">{personalErrors.last_name.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Middle Name</Label>
                    <Input {...registerPersonal('middle_name')} className="mt-1" placeholder="Optional" />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <Input type="tel" {...registerPersonal('phone')} className="mt-1" placeholder="Optional" />
                  </div>
                </div>
                <AdminEmailChangeSection />
                <Button type="submit" disabled={isSavingPersonal}>
                  {isSavingPersonal ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>) : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
                <div>
                  <Label>New Password</Label>
                  <div className="relative mt-1">
                    <Input type={showNewPassword ? 'text' : 'password'} {...registerPassword('newPassword', { required: 'New password is required', minLength: { value: 6, message: 'Minimum 6 characters' } })} />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordErrors.newPassword && <p className="text-sm text-destructive mt-1">{passwordErrors.newPassword.message}</p>}
                </div>
                <div>
                  <Label>Confirm New Password</Label>
                  <div className="relative mt-1">
                    <Input type={showConfirmPassword ? 'text' : 'password'} {...registerPassword('confirmPassword', { required: 'Please confirm your password', validate: (value) => value === newPassword || 'Passwords do not match' })} />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordErrors.confirmPassword && <p className="text-sm text-destructive mt-1">{passwordErrors.confirmPassword.message}</p>}
                </div>
                <Button type="submit" disabled={isSavingPassword}>
                  {isSavingPassword ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Changing...</>) : 'Change Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AdminProfile;
