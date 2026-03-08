import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Link as LinkIcon, Star, Search, X } from "lucide-react";

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  created_at: string | null;
  material_type: string | null;
  is_pinned: boolean | null;
  file_type: string | null;
}

const StudentMaterials = () => {
  const { student } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");

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
        .select("id, title, description, file_url, created_at, material_type, is_pinned, file_type, cohort_id")
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

  const materialTypes = useMemo(() => {
    const types = new Set<string>();
    materials.forEach((m) => {
      if (m.material_type) types.add(m.material_type);
      if (m.file_type) types.add(m.file_type);
    });
    return Array.from(types).sort();
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesSearch =
        !searchQuery ||
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType =
        selectedType === "all" ||
        m.material_type === selectedType ||
        m.file_type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [materials, searchQuery, selectedType]);

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

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search materials by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {materialTypes.length > 0 && (
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {materialTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {filteredMaterials.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No materials match your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMaterials.map((m) => (
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
                        <a href={`${m.file_url}?download=`} download>
                          <LinkIcon className="w-3 h-3 mr-1" />
                          Download
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default StudentMaterials;
