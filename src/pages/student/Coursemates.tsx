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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Mail, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface Classmate {
  profile_id: string | null;
  cohort_id: string | null;
  cohort_name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface UpdateProfileFormData {
  bio: string | null;
  profile_image_url: string | null;
  show_email: boolean;
}

const Coursemates = () => {
  const { user, student } = useAuth();
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [filteredClassmates, setFilteredClassmates] = useState<Classmate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStudentData, setCurrentStudentData] = useState<Tables<'students'> | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<UpdateProfileFormData>({
    defaultValues: {
      bio: currentStudentData?.bio || '',
      profile_image_url: '',
      show_email: currentStudentData?.show_email || false,
    },
  });

  const showEmail = watch('show_email');

  // Fetch classmates
  useEffect(() => {
    const fetchClassmates = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (!student?.cohort_id) {
        setClassmates([]);
        setFilteredClassmates([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('classmate_directory')
          .select('*')
          .eq('cohort_id', student.cohort_id)
          .order('display_name', { ascending: true });

        if (error) {
          console.error('Error fetching classmates:', error);
          toast.error('Failed to load classmates');
          setClassmates([]);
          setFilteredClassmates([]);
        } else {
          const safe = (data ?? []) as Classmate[];
          setClassmates(safe);
          setFilteredClassmates(safe);
        }
      } catch (error) {
        console.error('Error:', error);
        toast.error('An error occurred while loading classmates');
        setClassmates([]);
        setFilteredClassmates([]);
      } finally {
        setLoading(false);
      }
    };

    fetchClassmates();
  }, [user, student?.cohort_id]);

  // Fetch current student data for the modal
  useEffect(() => {
    const fetchStudentData = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching student data:', error);
        } else if (data) {
          setCurrentStudentData(data);
          reset({
            bio: data.bio || '',
            profile_image_url: '',
            show_email: data.show_email || false,
          });
        }
      } catch (error) {
        console.error('Error fetching student data:', error);
      }
    };

    fetchStudentData();
  }, [user, reset]);

  // Handle search
  useEffect(() => {
    const filtered = classmates.filter((classmate) =>
      (classmate?.display_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredClassmates(filtered);
  }, [searchQuery, classmates]);

  // Handle profile update
  const onSubmit = async (data: UpdateProfileFormData) => {
    if (!user || !currentStudentData) return;

    try {
      setIsUpdating(true);

      // Update student record
      const { error } = await supabase
        .from('students')
        .update({
          bio: data.bio || null,
          show_email: data.show_email,
        })
        .eq('id', currentStudentData.id);

      if (error) {
        console.error('Error updating profile:', error);
        toast.error('Failed to update profile');
      } else {
        toast.success('Profile updated successfully');
        setIsUpdateModalOpen(false);

        // Refresh classmates list to reflect changes
        const { data: updatedClassmates, error: fetchError } = await supabase
          .from('classmate_directory')
          .select('*')
          .eq('cohort_id', student?.cohort_id)
          .order('display_name', { ascending: true });

        if (!fetchError && updatedClassmates) {
          setClassmates(updatedClassmates as Classmate[]);
          setFilteredClassmates(updatedClassmates as Classmate[]);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred while updating profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Course Mates</h1>
          <p className="text-gray-600">Connect with your classmates in the {student?.cohort_id || 'your'} cohort</p>
        </div>

        {/* Search Bar and Update Button */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search classmates by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Dialog open={isUpdateModalOpen} onOpenChange={setIsUpdateModalOpen}>
            <DialogTrigger asChild>
              <Button>Update My Profile</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update My Profile</DialogTitle>
                <DialogDescription>
                  Update your bio and privacy settings for your classmates to see.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Bio */}
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell your classmates a little about yourself..."
                    {...register('bio')}
                    className="min-h-[100px]"
                  />
                  {errors.bio && <p className="text-sm text-red-500">{errors.bio.message}</p>}
                </div>

                {/* Show Email Toggle */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-email">Show email to classmates</Label>
                  <Switch
                    id="show-email"
                    checked={showEmail}
                    onCheckedChange={(checked) => {
                      reset({ ...watch(), show_email: checked });
                    }}
                  />
                </div>

                <Button type="submit" disabled={isUpdating} className="w-full">
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Classmates Grid */}
        {filteredClassmates.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-gray-500">
              {classmates.length === 0
                ? 'No classmates found in your cohort yet.'
                : `No results found for "${searchQuery}"`}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClassmates.map((classmate) => (
              <Card key={classmate.profile_id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  {/* Avatar */}
                  <div className="flex justify-center mb-4">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={classmate.avatar_url || ''} alt={classmate.display_name || ''} />
                      <AvatarFallback className="text-lg font-semibold">
                        {getInitials(classmate.display_name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* Name */}
                  <h3 className="text-lg font-semibold text-center mb-2">{classmate.display_name}</h3>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info Message */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            💡 <strong>Tip:</strong> Update your profile to add a bio and control whether your email is visible to classmates.
          </p>
        </div>
      </div>
    </StudentLayout>
  );
};

export default Coursemates;
