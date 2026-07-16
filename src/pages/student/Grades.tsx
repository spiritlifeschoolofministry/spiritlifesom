import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  GraduationCap, Award, BookOpen, Users, Briefcase, ClipboardList, FileText,
} from "lucide-react";
import { getLetterGrade } from "@/lib/grading";

interface GradedItem {
  id: string;
  title: string;
  category: string;
  max_points: number;
  grade: number | null;
  feedback: string | null;
  reviewed_at: string | null;
  course_title: string;
}

interface CategorySummary {
  category: string;
  icon: React.ElementType;
  totalPoints: number;
  earnedPoints: number;
  count: number;
  gradedCount: number;
  percentage: number;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Assignment: ClipboardList,
  Project: Briefcase,
  "Class Work": BookOpen,
  "Group Activity": Users,
  "Group Assignment": FileText,
};

const StudentGrades = () => {
  const { student } = useAuth();
  const [items, setItems] = useState<GradedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!student?.id || !student?.cohort_id) return;
    loadGrades();
  }, [student?.id, student?.cohort_id]);

  const loadGrades = async () => {
    if (!student?.id || !student?.cohort_id) return;
    try {
      setLoading(true);
      const { data: assignments, error: aErr } = await supabase
        .from("assignments")
        .select("id, title, max_points, course_id, courses(title)")
        .eq("cohort_id", student.cohort_id);
      if (aErr) throw aErr;

      const { data: submissions, error: sErr } = await supabase
        .from("assignment_submissions")
        .select("assignment_id, grade, feedback, reviewed_at")
        .eq("student_id", student.id);
      if (sErr) throw sErr;

      const subMap = new Map((submissions || []).map((s) => [s.assignment_id, s]));

      const gradedItems: GradedItem[] = (assignments || []).map((a: any) => {
        const sub = subMap.get(a.id);
        return {
          id: a.id,
          title: a.title,
          category: a.category || "Assignment",
          max_points: a.max_points || 100,
          grade: sub?.grade ?? null,
          feedback: sub?.feedback ?? null,
          reviewed_at: sub?.reviewed_at ?? null,
          course_title: a.courses?.title || "—",
        };
      });
      setItems(gradedItems);
    } catch (err) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const categories = Object.entries(
    items.reduce<Record<string, GradedItem[]>>((acc, item) => {
      const cat = item.category || "Assignment";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {})
  ).map(([category, catItems]): CategorySummary => {
    const graded = catItems.filter((i) => i.grade != null);
    const totalPoints = graded.reduce((s, i) => s + i.max_points, 0);
    const earnedPoints = graded.reduce((s, i) => s + (i.grade || 0), 0);
    const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    return {
      category,
      icon: CATEGORY_ICONS[category] || ClipboardList,
      totalPoints,
      earnedPoints,
      count: catItems.length,
      gradedCount: graded.length,
      percentage,
    };
  });

  const allGraded = items.filter((i) => i.grade != null);
  const overallTotal = allGraded.reduce((s, i) => s + i.max_points, 0);
  const overallEarned = allGraded.reduce((s, i) => s + (i.grade || 0), 0);
  const overallPct = overallTotal > 0 ? Math.round((overallEarned / overallTotal) * 100) : 0;
  const overallGrade = getLetterGrade(overallPct);

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (<Skeleton key={i} className="h-28 rounded-xl" />))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <PageHeader
          eyebrow="Academic Record"
          title="Grades"
          subtitle="Your academic performance overview across all categories."
        />

        {/* Overall Grade Card */}
        <Card className="shadow-[var(--shadow-card)] border-border overflow-hidden">
          <div className="h-1.5 gradient-flame" />
          <div className="flex flex-col sm:flex-row">
            <div className="flex-1 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="eyebrow mb-1">Overall Grade</p>
                  <p className="font-serif text-5xl font-bold text-primary leading-none">{overallPct}%</p>
                </div>
              </div>
              <div className="h-[6px] rounded-full bg-[#eee7db] overflow-hidden mb-2">
                <div className="h-full rounded-full gradient-flame" style={{ width: `${Math.min(100, Math.max(0, overallPct))}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {overallEarned}/{overallTotal} points · {allGraded.length} of {items.length} graded
              </p>
            </div>
            <div className="flex items-center justify-center p-6 sm:border-l border-t sm:border-t-0 border-border bg-secondary sm:min-w-[13rem]">
              <div className="text-center">
                <p className={`font-serif text-7xl font-bold leading-none ${overallGrade.color}`}>{overallGrade.letter}</p>
                <p className="text-xs text-muted-foreground mt-2 font-medium">{overallGrade.label} · Point {overallGrade.point}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Category Breakdown */}
        {categories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const grade = getLetterGrade(cat.percentage);
              const Icon = cat.icon;
              return (
                <Card key={cat.category} className="shadow-[var(--shadow-card)] border-border">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-gold" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{cat.category}</p>
                      </div>
                      <span className={`font-serif text-3xl font-bold leading-none ${grade.color}`}>{grade.letter}</span>
                    </div>
                    <div className="h-[5px] rounded-full bg-[#eee7db] overflow-hidden mb-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, cat.percentage))}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{cat.percentage}% · {cat.earnedPoints}/{cat.totalPoints} pts</span>
                      <span>{cat.gradedCount}/{cat.count} graded</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Detailed Grades Table */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-xl flex items-center gap-2">
              <Award className="w-5 h-5 text-gold" /> All Grades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No assignments or grades yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Title</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Course</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Score</TableHead>
                      <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const pct = item.grade != null ? Math.round((item.grade / item.max_points) * 100) : null;
                      const lg = pct != null ? getLetterGrade(pct) : null;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{item.category}</Badge></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{item.course_title}</TableCell>
                          <TableCell>
                            {item.grade != null ? (
                              <span className="font-semibold">{item.grade}/{item.max_points}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">Not graded</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {lg ? (
                              <span className={`font-serif text-lg font-bold ${lg.color}`}>{lg.letter} <span className="text-sm">({pct}%)</span></span>
                            ) : (
                              <Badge variant="warning" className="text-xs">Pending</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grading Scale Reference */}
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-xl">Grading Scale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
              {[
                { letter: "A", range: "70%+", label: "Excellent", point: 5, color: "text-emerald-600", tint: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/60 dark:border-emerald-800/40" },
                { letter: "B", range: "60-69%", label: "Very Good", point: 4, color: "text-blue-600", tint: "bg-blue-50 dark:bg-blue-900/20 border-blue-200/60 dark:border-blue-800/40" },
                { letter: "C", range: "50-59%", label: "Good", point: 3, color: "text-cyan-600", tint: "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200/60 dark:border-cyan-800/40" },
                { letter: "D", range: "45-49%", label: "Satisfactory", point: 2, color: "text-yellow-600", tint: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200/60 dark:border-yellow-800/40" },
                { letter: "E", range: "40-44%", label: "Pass", point: 1, color: "text-orange-600", tint: "bg-orange-50 dark:bg-orange-900/20 border-orange-200/60 dark:border-orange-800/40" },
                { letter: "F", range: "0-39%", label: "Fail", point: 0, color: "text-red-600", tint: "bg-red-50 dark:bg-red-900/20 border-red-200/60 dark:border-red-800/40" },
              ].map(g => (
                <div key={g.letter} className={`rounded-xl border p-4 ${g.tint}`}>
                  <p className={`font-serif text-4xl font-bold leading-none ${g.color}`}>{g.letter}</p>
                  <p className="font-semibold mt-2 text-foreground">{g.range}</p>
                  <p className="text-muted-foreground mt-0.5">{g.label}</p>
                  <p className="text-muted-foreground/70 mt-0.5">Point {g.point}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
};

export default StudentGrades;
