import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Search, Star, X } from "lucide-react";
import { EmptyCard, ScreenHeader } from "@/components/redesign/student-pages/ui";
import { cn } from "@/lib/utils";
import { resolveMaterialUrl } from "@/lib/material-url";
import { trackDownload } from "@/lib/activity";

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  created_at: string | null;
  material_type: string | null;
  learning_modes: string[] | null;
  is_pinned: boolean | null;
  file_type: string | null;
  storage_path: string | null;
  storage_provider: string | null;
  cohort_id: string | null;
}

const mapStudentLearningMode = (learningMode?: string | null) => {
  if (!learningMode) return ['All'];
  const normalized = learningMode.toLowerCase();
  if (normalized === 'online') return ['All', 'Online'];
  // Hybrid students attend both ways, so they get the online and physical
  // material as well as anything tagged Hybrid.
  // Treat legacy or alternative values 'blended' as 'Hybrid'
  if (normalized === 'hybrid' || normalized === 'blended') return ['All', 'Hybrid', 'Online', 'Physical'];
  // Treat 'on-site', 'onsite', and 'offline' as 'Physical'
  if (normalized === 'physical' || normalized === 'on-site' || normalized === 'onsite' || normalized === 'offline') return ['All', 'Physical'];
  return ['All', learningMode];
};

/**
 * The short label on a material's tile: PDF, MP3, DOCX… Taken from the stored
 * file type, else the file's extension, else what kind of material it is.
 */
const kindOf = (m: Material, url: string | null): string => {
  const fromType = m.file_type?.split("/").pop()?.split(/[.+;]/)[0];
  const fromUrl = url?.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
  const raw = fromType || fromUrl || (url ? "LINK" : m.material_type) || "FILE";
  const short = raw.toUpperCase();
  return short.length > 4 ? short.slice(0, 4) : short;
};

const isNew = (createdAt: string | null) =>
  !!createdAt && Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;

const StudentMaterials = () => {
  const { student } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");

  const loadMaterials = useCallback(async () => {
    if (!student?.cohort_id) {
      setMaterials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const learningModes = mapStudentLearningMode(student.learning_mode);
      const { data, error } = await supabase
        .from("course_materials")
        .select("id, title, description, file_url, created_at, material_type, learning_modes, is_pinned, file_type, cohort_id, storage_path, storage_provider")
        .eq("cohort_id", student.cohort_id)
        .overlaps("learning_modes", learningModes)
        .order("is_pinned", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMaterials((data as Material[]) || []);
    } catch (err) {
      console.error("[StudentMaterials] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [student?.cohort_id, student?.learning_mode]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

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
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-11 rounded-xl" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!materials.length) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ScreenHeader title="Course materials" />
        <EmptyCard icon={<FileText className="h-6 w-6" aria-hidden="true" />} title="No materials yet">
          Your course materials will appear here once your instructors upload them.
        </EmptyCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ScreenHeader
        title="Course materials"
        description="Handouts, notes and recordings for your cohort."
      />

      {/* Search & filter */}
      <div className="flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search materials"
            placeholder="Search by title or description"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 rounded-xl bg-card pl-9 pr-11"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery("")}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {materialTypes.length > 0 && (
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-11 w-full rounded-xl bg-card sm:w-[180px]" aria-label="Filter by type">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
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
        <div className="py-12 text-center text-muted-foreground">
          <Search className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
          <p>No materials match your search.</p>
        </div>
      ) : (
        <ul className="grid gap-2.5" aria-label="Materials">
          {filteredMaterials.map((m) => {
            const url = resolveMaterialUrl(m);
            const meta = [
              m.material_type,
              m.is_pinned ? "Pinned" : isNew(m.created_at) ? "New this week" : null,
              m.created_at ? new Date(m.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3",
                  m.is_pinned ? "border-primary/50" : "border-border",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#FBF3DE] text-[11px] font-extrabold text-[#7A5408] dark:bg-amber-500/15 dark:text-amber-300"
                >
                  {kindOf(m, url)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    {m.is_pinned && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-label="Featured" />}
                    <span className="min-w-0">{m.title}</span>
                  </h2>
                  {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
                  {m.description && <p className="line-clamp-2 text-xs text-muted-foreground">{m.description}</p>}
                </div>
                {url && (
                  <a
                    href={url}
                    download
                    aria-label={`Download ${m.title}`}
                    onClick={() =>
                      trackDownload({
                        subject: m.title,
                        subjectId: m.id,
                        portal: "student",
                        cohortId: m.cohort_id ?? null,
                      })
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Download className="h-[18px] w-[18px]" aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default StudentMaterials;
