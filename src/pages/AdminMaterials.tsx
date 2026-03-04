import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Pin, PinOff, FileText, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

interface Material {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  created_at: string | null;
  material_type: string | null;
  is_pinned: boolean | null;
}

const AdminMaterials = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_materials")
        .select("id, title, description, file_url, created_at, material_type, is_pinned")
        .order("is_pinned", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMaterials((data as Material[]) || []);
    } catch (err) {
      console.error("[AdminMaterials] Load error:", err);
      toast.error("Failed to load materials");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  const togglePin = async (material: Material) => {
    setTogglingId(material.id);
    try {
      const nextPinned = !material.is_pinned;
      const { error } = await supabase
        .from("course_materials")
        .update({ is_pinned: nextPinned })
        .eq("id", material.id);

      if (error) throw error;

      toast.success(nextPinned ? "Material pinned to top" : "Material unpinned");
      await loadMaterials();
    } catch (err) {
      console.error("[AdminMaterials] Toggle pin error:", err);
      toast.error("Failed to update pin state");
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Course Materials
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage teaching resources and highlight important items for students.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Materials</CardTitle>
        </CardHeader>
        <CardContent>
          {materials.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No materials uploaded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead className="text-right">Pin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        {m.title}
                        {m.is_pinned && (
                          <Badge className="ml-1 text-xs bg-amber-100 text-amber-800">
                            Featured
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {m.material_type || "General"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {m.created_at
                          ? new Date(m.created_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {m.file_url ? (
                          <a
                            href={m.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Open
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">No file</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => togglePin(m)}
                          disabled={togglingId === m.id}
                          className={m.is_pinned ? "bg-amber-50 border-amber-200" : ""}
                          title={m.is_pinned ? "Unpin material" : "Pin material"}
                        >
                          {togglingId === m.id ? (
                            <Pin className="w-4 h-4 animate-pulse" />
                          ) : m.is_pinned ? (
                            <Pin className="w-4 h-4 text-amber-700" />
                          ) : (
                            <PinOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMaterials;

