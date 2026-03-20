import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GraduationCap,
  Award,
  TrendingUp,
  BookOpen,
  FileText,
  Users,
  Briefcase,
  ClipboardList,
} from "lucide-react";

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

const getLetterGrade = (pct: number) => {
  if (pct >= 90) return { letter: "A", color: "text-emerald-600", description: "Excellent", isPassing: true };
  if (pct >= 80) return { letter: "B", color: "text-blue-600", description: "Very Good", isPassing: true };
  if (pct >= 70) return { letter: "C", color: "text-cyan-600", description: "Good", isPassing: true };
  if (pct >= 60) return { letter: "D", color: "text-yellow-600", description: "Satisfactory", isPassing: true };
  if (pct >= 50) return { letter: "E", color: "text-orange-600", description: "Needs Improvement", isPassing: true, needsRemedial: true };
  return { letter: "F", color: "text-red-600", description: "Unsatisfactory", isPassing: false };
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

      // Get all assignments for this cohort
      const { data: assignments, error: aErr } = await supabase
        .from("assignments")
        .select("id, title, max_points, course_id, courses(title)")
        .eq("cohort_id", student.cohort_id);

      if (aErr) throw aErr;

      // Get student's submissions
      const { data: submissions, error: sErr } = await supabase
        .from("assignment_submissions")
        .select("assignment_id, grade, feedback, reviewed_at")
        .eq("student_id", student.id);

      if (sErr) throw sErr;

      const subMap = new Map(
        (submissions || []).map((s) => [s.assignment_id, s])
      );

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
      console.error("[StudentGrades] Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Build category summaries
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

  // Overall
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
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Grades</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your academic performance overview across all categories.
          </p>
        </div>

        {/* Overall Grade Card */}
        <Card className="shadow-[var(--shadow-card)] border-border overflow-hidden">
          <div className="flex flex-col sm:flex-row">
            <div className="flex-1 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Overall Grade</p>
                  <p className="text-3xl font-bold text-foreground">{overallPct}%</p>
                </div>
              </div>
              <Progress value={overallPct} className="h-3 mb-2" />
              <p className="text-xs text-muted-foreground">
                {overallEarned}/{overallTotal} points · {allGraded.length} of {items.length} graded
              </p>
            </div>
            <div className="flex items-center justify-center p-6 sm:border-l border-t sm:border-t-0 border-border bg-secondary/30">
              <div className="text-center">
                <p className={`text-6xl font-black ${overallGrade.color}`}>{overallGrade.letter}</p>
                <p className="text-xs text-muted-foreground mt-1">Letter Grade</p>
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
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{cat.category}</p>
                      </div>
                      <span className={`text-lg font-bold ${grade.color}`}>{grade.letter}</span>
                    </div>
                    <Progress value={cat.percentage} className="h-2 mb-2" />
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
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" /> All Grades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No assignments or grades yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const pct = item.grade != null
                        ? Math.round((item.grade / item.max_points) * 100)
                        : null;
                      const lg = pct != null ? getLetterGrade(pct) : null;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                          </TableCell>
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
                              <span className={`font-bold ${lg.color}`}>{lg.letter} ({pct}%)</span>
                            ) : (
                              <Badge variant="outline" className="text-xs">Pending</Badge>
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
      </div>
    </StudentLayout>
  );
};

export default StudentGrades;
