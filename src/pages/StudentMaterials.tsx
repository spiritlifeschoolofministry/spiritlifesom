import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Link as LinkIcon, Star } from "lucide-react";

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  created_at: string | null;
  material_type: string | null;
  is_pinned: boolean | null;
}

const StudentMaterials = () => {
  const { student } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMaterials = async () => {
    if (!student?.cohort_id) {
      setMaterials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_materials")
        .select("id, title, description, file_url, created_at, material_type, is_pinned, cohort_id")
        .eq("cohort_id", student.cohort_id)
        .order("is_pinned", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMaterials((data as Material[]) || []);
    } catch (err) {
      console.error("[StudentMaterials] Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [student?.cohort_id]);

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (!materials.length) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center py-12">
          <div className="bg-muted rounded-full p-4 mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Course Materials</h2>
          <p className="text-muted-foreground mb-2 max-w-md">
            Your course materials will appear here once your instructors upload them.
          </p>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Course Materials
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Access handouts, notes, and other learning resources for your cohort.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {materials.map((m) => (
            <Card
              key={m.id}
              className={
                m.is_pinned
                  ? "shadow-[var(--shadow-card)] border-amber-200 bg-amber-50/60"
                  : "shadow-[var(--shadow-card)] border-border"
              }
            >
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm sm:text-base">
                      {m.title}
                    </CardTitle>
                    {m.material_type && (
                      <p className="text-[11px] text-muted-foreground">
                        {m.material_type}
                      </p>
                    )}
                  </div>
                </div>
                {m.is_pinned && (
                  <Badge className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800">
                    <Star className="w-3 h-3" /> Featured
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {m.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {m.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {m.created_at
                      ? new Date(m.created_at).toLocaleDateString()
                      : ""}
                  </span>
                  {m.file_url && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                    >
                      <a href={m.file_url} target="_blank" rel="noreferrer">
                        <LinkIcon className="w-3 h-3 mr-1" />
                        Open
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentMaterials;

