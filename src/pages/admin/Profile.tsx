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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const {
    register: registerPersonal,
    handleSubmit: handlePersonalSubmit,
    formState: { errors: personalErrors },
    reset: resetPersonal,
  } = useForm<PersonalFormData>({
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      middle_name: profile?.middle_name || '',
      phone: profile?.phone || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPassword,
    watch,
  } = useForm<PasswordFormData>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const newPassword = watch('newPassword');

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        setLoading(true);
        const { count: studentsCount } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true });

        const { count: coursesCount } = await supabase
          .from('courses')
          .select('*', { count: 'exact', head: true });

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
      resetPersonal({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        middle_name: profile.middle_name || '',
        phone: profile.phone || '',
      });
    }
  }, [profile, resetPersonal]);

  useEffect(() => {
    setAvatarPreview(profile?.avatar_url || null);
  }, [profile]);

  const onPersonalSubmit = async (data: PersonalFormData) => {
    if (!user) return;

    try {
      setIsSavingPersonal(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          middle_name: data.middle_name,
          phone: data.phone,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      toast.error(message);
      console.error('Error updating profile:', error);
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const [isSavingSocial, setIsSavingSocial] = useState(false);

  const {
    register: registerSocial,
    handleSubmit: handleSocialSubmit,
    reset: resetSocial,
  } = useForm<{
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  }>({
    defaultValues: {
      facebook: profile?.facebook || '',
      instagram: profile?.instagram || '',
      twitter: profile?.twitter || '',
      linkedin: profile?.linkedin || '',
      youtube: profile?.youtube || '',
    },
  });

  useEffect(() => {
    if (profile) {
      resetSocial({
        facebook: profile.facebook || '',
        instagram: profile.instagram || '',
        twitter: profile.twitter || '',
        linkedin: profile.linkedin || '',
        youtube: profile.youtube || '',
      });
    }
  }, [profile, resetSocial]);

  const onSocialSubmit = async (data: { facebook?: string; instagram?: string; twitter?: string; linkedin?: string; youtube?: string }) => {
    if (!user) return;
    try {
      setIsSavingSocial(true);
      const normalize = (val?: string | null) => {
        if (!val) return null;
        try {
          new URL(val);
          return val;
        } catch {
          try {
            const withProto = `https://${val}`;
            new URL(withProto);
            return withProto;
          } catch {
            throw new Error(`Invalid URL: ${val}`);
          }
        }
      };
      const updateData = {
        facebook: data.facebook || null,
        instagram: data.instagram || null,
        twitter: data.twitter || null,
        linkedin: data.linkedin || null,
        youtube: data.youtube || null,
      };
      const { error } = await supabase.from('profiles').update(updateData).eq('id', user.id);
      if (error) throw error;
      toast.success('Social links saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save social links';
      toast.error(msg);
    } finally {
      setIsSavingSocial(false);
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
      const { data: publicData } = await supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = (publicData as { publicUrl: string })?.publicUrl || (publicData as unknown as { public_url: string })?.public_url || '';
      const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (error) throw error;
      toast.success('Avatar uploaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload avatar';
      toast.error(msg);
      console.error('Avatar upload error:', err);
    } finally {
      setIsUploadingAvatar(false);
      setAvatarFile(null);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (data.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      setIsSavingPassword(true);
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) throw error;

      toast.success('Password changed successfully');
      resetPassword();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      toast.error(message);
      console.error('Error changing password:', error);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const initials = profile ? `${(profile.first_name || 'A')[0]}${(profile.last_name || 'U')[0]}` : 'AU';

  return (
    <div className="space-y-6 pb-8">
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
            {avatarPreview && <AvatarImage src={avatarPreview} alt="Profile" />}
            <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <input id="avatar" type="file" accept="image/*" onChange={handleAvatarChange} />
            <div className="flex gap-2">
              <Button onClick={uploadAvatar} disabled={isUploadingAvatar || !avatarFile}>
                {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
              </Button>
            </div>
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
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Admin Overview Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Students</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{studentCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Active student accounts</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Courses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{courseCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Available courses</p>
              </CardContent>
            </Card>
          </div>

          {/* Admin Permissions Section */}
          <Card>
            <CardHeader>
              <CardTitle>Admin Permissions</CardTitle>
              <CardDescription>Your role and associated permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Account Type</Label>
                  <div className="mt-2">
                    <Badge className="bg-primary text-primary-foreground uppercase">{profile?.role || 'Admin'}</Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground mb-2 block">Manage</Label>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Student accounts and profiles
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Course content and materials
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Admissions and enrollments
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Attendance records
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      Assignments and grades
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      System announcements
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Social Links Section */}
          <Card>
            <CardHeader>
              <CardTitle>Social Links</CardTitle>
              <CardDescription>Public links to your social profiles</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSocialSubmit(onSocialSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="facebook">Facebook</Label>
                    <Input id="facebook" {...registerSocial('facebook')} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="instagram">Instagram</Label>
                    <Input id="instagram" {...registerSocial('instagram')} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="twitter">X / Twitter</Label>
                    <Input id="twitter" {...registerSocial('twitter')} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="linkedin">LinkedIn</Label>
                    <Input id="linkedin" {...registerSocial('linkedin')} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="youtube">YouTube</Label>
                  <Input id="youtube" {...registerSocial('youtube')} className="mt-1" />
                </div>
                <Button type="submit" disabled={isSavingSocial} className="w-full sm:w-auto mt-4">Save Social Links</Button>
              </form>
            </CardContent>
          </Card>

          {/* Personal Information Section */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your profile details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePersonalSubmit(onPersonalSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      {...registerPersonal('first_name', { required: 'First name is required' })}
                      className="mt-1"
                    />
                    {personalErrors.first_name && (
                      <p className="text-sm text-destructive mt-1">{personalErrors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      {...registerPersonal('last_name', { required: 'Last name is required' })}
                      className="mt-1"
                    />
                    {personalErrors.last_name && (
                      <p className="text-sm text-destructive mt-1">{personalErrors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="middleName">Middle Name</Label>
                    <Input
                      id="middleName"
                      {...registerPersonal('middle_name')}
                      className="mt-1"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      {...registerPersonal('phone')}
                      className="mt-1"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile?.email || ''}
                    disabled
                    className="mt-1 bg-muted"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                </div>

                <Button type="submit" disabled={isSavingPersonal} className="w-full sm:w-auto mt-4">
                  {isSavingPersonal && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Personal Information
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Change Password Section */}
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      {...registerPassword('currentPassword', { required: 'Current password is required' })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordErrors.currentPassword && (
                    <p className="text-sm text-destructive mt-1">{passwordErrors.currentPassword.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      {...registerPassword('newPassword', {
                        required: 'New password is required',
                        minLength: { value: 6, message: 'Password must be at least 6 characters' },
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordErrors.newPassword && (
                    <p className="text-sm text-destructive mt-1">{passwordErrors.newPassword.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      {...registerPassword('confirmPassword', {
                        required: 'Please confirm your password',
                        validate: (value) => value === newPassword || 'Passwords do not match',
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordErrors.confirmPassword && (
                    <p className="text-sm text-destructive mt-1">{passwordErrors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" disabled={isSavingPassword} className="w-full sm:w-auto mt-4">
                  {isSavingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Change Password
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
