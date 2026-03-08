import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import StudentLayout from '@/components/StudentLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Mail, Search, Users, MapPin, Phone, BookOpen, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface ClassmateEnriched {
  profile_id: string | null;
  cohort_id: string | null;
  cohort_name: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string | null;
  // Enriched fields from students/profiles
  bio: string | null;
  email: string | null;
  show_email: boolean;
  phone: string | null;
  learning_mode: string | null;
  gender: string | null;
}

interface UpdateProfileFormData {
  bio: string | null;
  show_email: boolean;
}

const Coursemates = () => {
  const { user, student } = useAuth();
  const [classmates, setClassmates] = useState<ClassmateEnriched[]>([]);
  const [filteredClassmates, setFilteredClassmates] = useState<ClassmateEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassmate, setSelectedClassmate] = useState<ClassmateEnriched | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStudentData, setCurrentStudentData] = useState<Tables<'students'> | null>(null);

  const { register, handleSubmit, reset, watch } = useForm<UpdateProfileFormData>({
    defaultValues: { bio: '', show_email: false },
  });

  const showEmail = watch('show_email');

  useEffect(() => {
    if (!user || !student?.cohort_id) {
      setLoading(false);
      return;
    }
    fetchClassmates();
    fetchStudentData();
  }, [user, student?.cohort_id]);

  const fetchClassmates = async () => {
    try {
      setLoading(true);
      // Get directory entries
      const { data: dirData, error: dirError } = await supabase
        .from('classmate_directory')
        .select('*')
        .eq('cohort_id', student!.cohort_id!)
        .order('display_name', { ascending: true });

      if (dirError) throw dirError;

      // Enrich with student data (bio, show_email, learning_mode, gender)
      const profileIds = (dirData || []).map(d => d.profile_id).filter(Boolean) as string[];

      const [studentsRes, profilesRes] = await Promise.all([
        supabase
          .from('students')
          .select('profile_id, bio, show_email, learning_mode, gender')
          .in('profile_id', profileIds),
        supabase
          .from('profiles')
          .select('id, email, phone')
          .in('id', profileIds),
      ]);

      const studentMap = new Map(
        (studentsRes.data || []).map(s => [s.profile_id, s])
      );
      const profileMap = new Map(
        (profilesRes.data || []).map(p => [p.id, p])
      );

      const enriched: ClassmateEnriched[] = (dirData || []).map(d => {
        const stu = studentMap.get(d.profile_id || '');
        const prof = profileMap.get(d.profile_id || '');
        return {
          ...d,
          bio: stu?.bio || null,
          show_email: stu?.show_email || false,
          email: prof?.email || null,
          phone: prof?.phone || null,
          learning_mode: stu?.learning_mode || null,
          gender: stu?.gender || null,
        };
      });

      setClassmates(enriched);
      setFilteredClassmates(enriched);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load classmates');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentData = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (data) {
      setCurrentStudentData(data);
      reset({ bio: data.bio || '', show_email: data.show_email || false });
    }
  };

  useEffect(() => {
    const filtered = classmates.filter(c =>
      (c.display_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredClassmates(filtered);
  }, [searchQuery, classmates]);

  const onSubmit = async (data: UpdateProfileFormData) => {
    if (!user || !currentStudentData) return;
    try {
      setIsUpdating(true);
      const { error } = await supabase
        .from('students')
        .update({ bio: data.bio || null, show_email: data.show_email })
        .eq('id', currentStudentData.id);

      if (error) throw error;
      toast.success('Profile updated');
      setIsUpdateModalOpen(false);
      fetchClassmates();
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase() || '?';
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
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Course Mates</h1>
              <p className="text-sm text-muted-foreground">
                {classmates.length} classmate{classmates.length !== 1 ? 's' : ''} in {classmates[0]?.cohort_name || 'your cohort'}
              </p>
            </div>
          </div>
        </div>

        {/* Search + Update Profile */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search classmates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={isUpdateModalOpen} onOpenChange={setIsUpdateModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">Update My Profile</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update My Profile</DialogTitle>
                <DialogDescription>Update your bio and privacy settings.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea id="bio" placeholder="Tell your classmates about yourself..." {...register('bio')} className="min-h-[100px]" />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-email">Show email to classmates</Label>
                  <Switch
                    id="show-email"
                    checked={showEmail}
                    onCheckedChange={checked => reset({ ...watch(), show_email: checked })}
                  />
                </div>
                <Button type="submit" disabled={isUpdating} variant="flame" className="w-full">
                  {isUpdating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Grid */}
        {!student?.cohort_id ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              You have not been assigned to a cohort yet.
            </CardContent>
          </Card>
        ) : filteredClassmates.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              {classmates.length === 0 ? 'No classmates found in your cohort yet.' : `No results for "${searchQuery}"`}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClassmates.map(classmate => {
              const isMe = classmate.profile_id === user?.id;
              return (
                <Card
                  key={classmate.profile_id ?? Math.random()}
                  className="group border-border shadow-[var(--shadow-card)] hover:shadow-lg transition-all cursor-pointer"
                  onClick={() => setSelectedClassmate(classmate)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-14 w-14 border-2 border-background shadow-md shrink-0">
                        <AvatarImage src={classmate.avatar_url || ''} />
                        <AvatarFallback className="text-sm font-bold bg-primary text-primary-foreground">
                          {getInitials(classmate.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {classmate.display_name || 'Unknown'}
                          </h3>
                          {isMe && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">You</Badge>}
                        </div>
                        {classmate.learning_mode && (
                          <div className="flex items-center gap-1 mt-1">
                            <BookOpen className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{classmate.learning_mode}</span>
                          </div>
                        )}
                        {classmate.bio && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{classmate.bio}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Classmate Detail Dialog */}
        <Dialog open={!!selectedClassmate} onOpenChange={open => !open && setSelectedClassmate(null)}>
          <DialogContent className="max-w-md">
            {selectedClassmate && (
              <>
                <div className="flex flex-col items-center text-center pt-2">
                  <Avatar className="h-20 w-20 border-4 border-background shadow-lg mb-3">
                    <AvatarImage src={selectedClassmate.avatar_url || ''} />
                    <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
                      {getInitials(selectedClassmate.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <h2 className="text-lg font-bold text-foreground">{selectedClassmate.display_name || 'Unknown'}</h2>
                  {selectedClassmate.cohort_name && (
                    <p className="text-sm text-muted-foreground">{selectedClassmate.cohort_name}</p>
                  )}
                </div>

                <div className="space-y-3 mt-4">
                  {selectedClassmate.bio && (
                    <div className="p-3 rounded-lg bg-secondary/50">
                      <p className="text-xs text-muted-foreground font-medium mb-1">About</p>
                      <p className="text-sm text-foreground">{selectedClassmate.bio}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {selectedClassmate.learning_mode && (
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <BookOpen className="w-3.5 h-3.5 text-primary" />
                          <p className="text-xs text-muted-foreground font-medium">Mode</p>
                        </div>
                        <p className="text-sm font-medium text-foreground">{selectedClassmate.learning_mode}</p>
                      </div>
                    )}
                    {selectedClassmate.gender && (
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Users className="w-3.5 h-3.5 text-primary" />
                          <p className="text-xs text-muted-foreground font-medium">Gender</p>
                        </div>
                        <p className="text-sm font-medium text-foreground">{selectedClassmate.gender}</p>
                      </div>
                    )}
                  </div>

                  {selectedClassmate.show_email && selectedClassmate.email && (
                    <a
                      href={`mailto:${selectedClassmate.email}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <Mail className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm text-foreground truncate">{selectedClassmate.email}</span>
                    </a>
                  )}

                  {!selectedClassmate.bio && !selectedClassmate.show_email && !selectedClassmate.learning_mode && (
                    <p className="text-sm text-center text-muted-foreground py-4">
                      This classmate hasn't shared additional details yet.
                    </p>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </StudentLayout>
  );
};

export default Coursemates;
