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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, AlertCircle, Save } from 'lucide-react';
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

interface AcademicFormData {
  learning_mode: string;
  preferred_language: string;
  educational_background: string;
  marital_status: string;
  address: string;
  ministry_description: string;
}

const LEARNING_MODES = ['On-site', 'Online', 'Hybrid'];
const LANGUAGES = ['English', 'French', 'Yoruba', 'Igbo', 'Hausa', 'Other'];
const EDUCATION_LEVELS = ['Primary', 'Secondary', 'Diploma', 'Bachelor\'s Degree', 'Master\'s Degree', 'Doctorate', 'Other'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];

const AcademicInfoCard = ({
  studentData,
  userId,
  onSaved,
}: {
  studentData: Tables<'students'>;
  userId: string | undefined;
  onSaved: (data: Tables<'students'>) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<AcademicFormData>({
    learning_mode: studentData.learning_mode || '',
    preferred_language: studentData.preferred_language || '',
    educational_background: studentData.educational_background || '',
    marital_status: studentData.marital_status || '',
    address: studentData.address || '',
    ministry_description: studentData.ministry_description || '',
  });

  // Check if any key fields are missing to show a prompt
  const hasMissingFields = !studentData.learning_mode || !studentData.educational_background || !studentData.marital_status || !studentData.preferred_language;

  const handleSave = async () => {
    if (!userId) return;
    try {
      setIsSaving(true);
      const updateData = {
        learning_mode: form.learning_mode || null,
        preferred_language: form.preferred_language || null,
        educational_background: form.educational_background || null,
        marital_status: form.marital_status || null,
        address: form.address || null,
        ministry_description: form.ministry_description || null,
      };
      const { data, error } = await supabase
        .from('students')
        .update(updateData)
        .eq('profile_id', userId)
        .select()
        .single();
      if (error) throw error;
      if (data) onSaved(data);
      toast.success('Academic information updated');
      setIsEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const InfoRow = ({ label, value }: { label: string; value: string | null }) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-sm font-medium mt-0.5 capitalize">{value || <span className="text-muted-foreground italic">Not provided</span>}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Academic Information</CardTitle>
            <CardDescription>Your enrollment and academic details</CardDescription>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </div>
        {hasMissingFields && !isEditing && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Some academic details are missing. Click <strong>Edit</strong> to complete your profile.</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Read-only fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Student Code</Label>
            <p className="text-sm font-semibold mt-0.5">{studentData.student_code || 'N/A'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Admission Status</Label>
            <div className="mt-1">
              <Badge variant={studentData.admission_status === 'ADMITTED' ? 'default' : studentData.admission_status === 'Pending' ? 'secondary' : 'destructive'}>
                {studentData.admission_status || 'Pending'}
              </Badge>
            </div>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Learning Mode</Label>
                <Select value={form.learning_mode} onValueChange={(v) => setForm(f => ({ ...f, learning_mode: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select mode" /></SelectTrigger>
                  <SelectContent>
                    {LEARNING_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Preferred Language</Label>
                <Select value={form.preferred_language} onValueChange={(v) => setForm(f => ({ ...f, preferred_language: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select language" /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Educational Background</Label>
                <Select value={form.educational_background} onValueChange={(v) => setForm(f => ({ ...f, educational_background: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select level" /></SelectTrigger>
                  <SelectContent>
                    {EDUCATION_LEVELS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Marital Status</Label>
                <Select value={form.marital_status} onValueChange={(v) => setForm(f => ({ ...f, marital_status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {MARITAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} className="mt-1" placeholder="Your address" />
            </div>
            <div>
              <Label>Ministry Description</Label>
              <Textarea value={form.ministry_description} onChange={(e) => setForm(f => ({ ...f, ministry_description: e.target.value }))} className="mt-1" placeholder="Describe your ministry involvement" rows={3} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => {
                setIsEditing(false);
                setForm({
                  learning_mode: studentData.learning_mode || '',
                  preferred_language: studentData.preferred_language || '',
                  educational_background: studentData.educational_background || '',
                  marital_status: studentData.marital_status || '',
                  address: studentData.address || '',
                  ministry_description: studentData.ministry_description || '',
                });
              }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="Learning Mode" value={studentData.learning_mode} />
              <InfoRow label="Preferred Language" value={studentData.preferred_language} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="Educational Background" value={studentData.educational_background} />
              <InfoRow label="Marital Status" value={studentData.marital_status} />
            </div>
            {studentData.address && <InfoRow label="Address" value={studentData.address} />}
            {studentData.ministry_description && <InfoRow label="Ministry Description" value={studentData.ministry_description} />}
          </>
        )}
      </CardContent>
    </Card>
  );
};

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

  // Social links removed - columns don't exist in profiles table

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
      const publicUrl = (publicData as unknown as { publicUrl?: string; public_url?: string })?.publicUrl || (publicData as unknown as { publicUrl?: string; public_url?: string })?.public_url || '';
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

  const initials = profile ? `${(profile.first_name || 'S')[0]}${(profile.last_name || 'U')[0]}` : 'SU';

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        {/* Profile Header */}
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <Avatar className="h-20 w-20 sm:h-24 sm:w-24 shrink-0">
              {avatarPreview && <AvatarImage src={avatarPreview} alt="Profile" />}
              <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2 items-center sm:items-start w-full min-w-0">
              <input id="avatar" type="file" accept="image/*" onChange={handleAvatarChange} className="text-sm w-full max-w-[250px]" />
              <Button size="sm" onClick={uploadAvatar} disabled={isUploadingAvatar || !avatarFile}>
                {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
              </Button>
            </div>
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground break-words">
              {profile ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ') : 'Student'}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm break-all">{profile?.email}</p>
            <Badge className="w-fit bg-primary text-primary-foreground mt-2">{profile?.role || 'Student'}</Badge>
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

            {/* Social Links section removed - not supported by current schema */}

            {/* Academic Information Section */}
            {studentData && (
              <AcademicInfoCard
                studentData={studentData}
                userId={user?.id}
                onSaved={(updated) => setStudentData(updated)}
              />
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentProfile;
