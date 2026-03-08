import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import StudentLayout from '@/components/StudentLayout';
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
import { GraduationCap } from 'lucide-react';

interface Graduate {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  cohort_name: string;
  cohort_id: string | null;
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

  useEffect(() => {
    const load = async () => {
      try {
        const [studentsRes, cohortsRes] = await Promise.all([
          supabase
            .from('students')
            .select(`
              id, cohort_id,
              profiles!students_profile_id_fkey ( first_name, last_name, avatar_url ),
              cohorts!students_cohort_id_fkey ( name )
            `)
            .eq('admission_status', 'Graduate'),
          supabase.from('cohorts').select('id, name').order('name'),
        ]);

        if (studentsRes.error) throw studentsRes.error;

        const list: Graduate[] = (studentsRes.data as any)?.map((s: any) => ({
          id: s.id,
          first_name: s.profiles?.first_name || '',
          last_name: s.profiles?.last_name || '',
          avatar_url: s.profiles?.avatar_url || null,
          cohort_name: s.cohorts?.name || 'Unknown',
          cohort_id: s.cohort_id,
        })) || [];

        setGraduates(list);
        if (cohortsRes.data) setCohorts(cohortsRes.data);
      } catch (err) {
        console.error('Load graduates error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = cohortFilter === 'all'
    ? graduates
    : graduates.filter(g => g.cohort_id === cohortFilter);

  return (
    <StudentLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6" /> Graduates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Alumni from all cohorts</p>
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
                  </div>
                  <GraduationCap className="h-5 w-5 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default Graduates;
