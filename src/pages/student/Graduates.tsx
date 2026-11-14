import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AlumniCorner from '@/components/student/AlumniCorner';
import { servingLine } from '@/lib/alumni';
import type { Tables } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GraduationCap, Quote } from 'lucide-react';

interface Graduate {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  cohort_name: string;
  cohort_id: string | null;
  /** "Youth pastor at Grace Chapel · Ibadan", empty when they have not said. */
  serving: string;
}

interface CohortOption {
  id: string;
  name: string;
}

const Graduates = () => {
  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [loading, setLoading] = useState(true);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [cohortFilter, setCohortFilter] = useState('all');
  const [testimonies, setTestimonies] = useState<Tables<'alumni_testimony_wall'>[]>([]);
  const { student } = useAuth();
  const isGraduate = (student?.admission_status ?? '').toUpperCase() === 'GRADUATE';

  const load = useCallback(async () => {
      try {
        // Read through graduate_directory: students_select limits a student to
        // their own row, so querying students directly returned no graduates.
        const [gradsRes, cohortsRes, wallRes] = await Promise.all([
          supabase
            .from('graduate_directory')
            .select('id, first_name, last_name, avatar_url, cohort_id, cohort_name, serving_as, serving_at, location')
            .order('last_name', { ascending: true }),
          supabase.from('cohorts').select('id, name').order('name'),
          supabase.from('alumni_testimony_wall').select('*').order('created_at', { ascending: false }),
        ]);
        if (wallRes.error) console.error('Load testimonies error:', wallRes.error);
        setTestimonies(wallRes.data || []);

        if (gradsRes.error) throw gradsRes.error;

        const list: Graduate[] = (gradsRes.data || []).map((g) => ({
          id: g.id ?? '',
          first_name: g.first_name || '',
          last_name: g.last_name || '',
          avatar_url: g.avatar_url || null,
          cohort_name: g.cohort_name || 'Unknown',
          cohort_id: g.cohort_id,
          serving: servingLine(g),
        }));

        setGraduates(list);
        if (cohortsRes.data) setCohorts(cohortsRes.data);
      } catch (err) {
        console.error('Load graduates error:', err);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = cohortFilter === 'all'
    ? graduates
    : graduates.filter(g => g.cohort_id === cohortFilter);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6" /> Graduates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Alumni from all cohorts, where they serve now, and their testimonies</p>
          </div>
          <Select value={cohortFilter} onValueChange={setCohortFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by cohort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cohorts</SelectItem>
              {cohorts.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isGraduate && student?.id && <AlumniCorner studentId={student.id} onChanged={load} />}

        <Tabs defaultValue="directory">
          <TabsList>
            <TabsTrigger value="directory">Directory ({filtered.length})</TabsTrigger>
            <TabsTrigger value="testimonies">Testimonies ({testimonies.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="directory" className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No graduates found{cohortFilter !== 'all' ? ' for this cohort' : ''}.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((g) => (
              <Card key={g.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <Avatar className="h-12 w-12">
                    {g.avatar_url && <AvatarImage src={g.avatar_url} />}
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {g.first_name[0]}{g.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{g.first_name} {g.last_name}</p>
                    <Badge variant="secondary" className="text-xs mt-1">{g.cohort_name}</Badge>
                    {g.serving && <p className="text-xs text-muted-foreground mt-1">{g.serving}</p>}
                  </div>
                  <GraduationCap className="h-5 w-5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </TabsContent>
          <TabsContent value="testimonies" className="mt-4">
            {testimonies.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Quote className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No testimonies have been shared yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {testimonies.map((t) => (
                  <Card key={t.id}>
                    <CardContent className="py-4 space-y-3">
                      <p className="text-sm whitespace-pre-wrap">{t.body}</p>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          {t.avatar_url && <AvatarImage src={t.avatar_url} />}
                          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                            {(t.first_name || '')[0]}{(t.last_name || '')[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{t.first_name} {t.last_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[t.cohort_name, servingLine(t), t.created_at && formatDistanceToNow(new Date(t.created_at), { addSuffix: true })].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default Graduates;
