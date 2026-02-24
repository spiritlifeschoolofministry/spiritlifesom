import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import StudentLayout from '@/components/StudentLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

interface PersonalFormData {
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
}

interface SocialFormData {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const StudentProfile = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [studentData, setStudentData] = useState<Tables<'students'> | null>(null);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    const fetchStudentData = async () => {
      if (!user) return;

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('profile_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching student data:', error);
        } else if (data) {
          setStudentData(data);
        }
      } catch (error) {
        console.error('Error fetching student data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, [user]);

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
  } = useForm<SocialFormData>({
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

  const onSocialSubmit = async (data: SocialFormData) => {
    if (!user) return;
    try {
      setIsSavingSocial(true);
      const updateData: Partial<Tables<'profiles'>['Update']> = {
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

  const initials = profile ? `${(profile.first_name || 'S')[0]}${(profile.last_name || 'U')[0]}` : 'SU';

  return (
    <StudentLayout>
      <div className="space-y-6 pb-8">
        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Profile" />}
            <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  {profile ? `${profile.first_name} ${profile.last_name}` : 'Student'}
                </h1>
                <p className="text-muted-foreground mt-1">{profile?.email}</p>
              </div>
              <Badge className="w-fit bg-primary text-primary-foreground">{profile?.role || 'Student'}</Badge>
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
                  <Button type="submit" disabled={isSavingSocial} className="w-full sm:w-auto mt-4">
                    Save Social Links
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Academic Information Section */}
            {studentData && (
              <Card>
                <CardHeader>
                  <CardTitle>Academic Information</CardTitle>
                  <CardDescription>Your enrollment and academic status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form onSubmit={async (e) => { e.preventDefault();
                      if (!user || !studentData) return;
                      try {
                        setIsSavingPersonal(true);
                        const updateData: Partial<Tables<'students'>['Update']> = {
                          learning_mode: (document.getElementById('learningMode') as HTMLInputElement)?.value || studentData.learning_mode,
                          preferred_language: (document.getElementById('preferredLanguage') as HTMLInputElement)?.value || studentData.preferred_language,
                          ministry_description: (document.getElementById('ministryDescription') as HTMLInputElement)?.value || studentData.ministry_description,
                          educational_background: (document.getElementById('educationalBackground') as HTMLInputElement)?.value || studentData.educational_background,
                          address: (document.getElementById('address') as HTMLInputElement)?.value || studentData.address,
                        };
                        const { error } = await supabase.from('students').update(updateData).eq('profile_id', user.id);
                        if (error) throw error;
                        toast.success('Academic information saved');
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Failed to save academic info';
                        toast.error(msg);
                      } finally {
                        setIsSavingPersonal(false);
                      }
                    }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Student Code</Label>
                      <p className="text-lg font-semibold mt-1">{studentData.student_code || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Admission Status</Label>
                      <div className="mt-1">
                        <Badge
                          variant={
                            studentData.admission_status === 'Approved'
                              ? 'default'
                              : studentData.admission_status === 'Pending'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {studentData.admission_status || 'Pending'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Learning Mode</Label>
                      <p className="text-lg font-semibold mt-1 capitalize">{studentData.learning_mode || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Preferred Language</Label>
                      <p className="text-lg font-semibold mt-1 capitalize">{studentData.preferred_language || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Educational Background</Label>
                      <p className="text-lg font-semibold mt-1 capitalize">{studentData.educational_background || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Marital Status</Label>
                      <p className="text-lg font-semibold mt-1 capitalize">{studentData.marital_status || 'N/A'}</p>
                    </div>
                  </div>

                  {studentData.ministry_description && (
                    <div>
                      <Label className="text-muted-foreground">Ministry Description</Label>
                      <p className="text-base mt-1">{studentData.ministry_description}</p>
                    </div>
                  )}

                  {studentData.address && (
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Input id="address" defaultValue={studentData.address || ''} className="mt-1" />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="learningMode">Learning Mode</Label>
                      <Input id="learningMode" defaultValue={studentData.learning_mode || ''} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="preferredLanguage">Preferred Language</Label>
                      <Input id="preferredLanguage" defaultValue={studentData.preferred_language || ''} className="mt-1" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="educationalBackground">Educational Background</Label>
                      <Input id="educationalBackground" defaultValue={studentData.educational_background || ''} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="ministryDescription">Ministry Description</Label>
                      <Textarea id="ministryDescription" defaultValue={studentData.ministry_description || ''} className="mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button type="submit">Save Academic Information</Button>
                  </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentProfile;
