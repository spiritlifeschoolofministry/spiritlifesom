import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageSkeleton } from "@/components/portal/PageSkeleton";
import { AdminPageHeader, Panel, StatusPill } from "@/components/redesign/admin/primitives";
import { APPROVE_BUTTON, type Tone } from "@/components/redesign/admin/styles";
import { servingLine, testimonyStatusLabel } from "@/lib/alumni";
import type { Tables } from "@/integrations/supabase/types";

interface Testimony extends Tables<"alumni_testimonies"> {
  student: {
    id: string;
    cohort: { name: string } | null;
    profile: { first_name: string | null; last_name: string | null } | null;
    alumni: Pick<Tables<"alumni_profiles">, "serving_as" | "serving_at" | "location"> | null;
  } | null;
}

const TONE: Record<string, Tone> = { pending: "warn", approved: "good", hidden: "neutral" };

const AdminAlumni = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Testimony[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Testimony | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("alumni_testimonies")
      .select(
        "*, student:students(id, cohort:cohorts(name), profile:profiles(first_name, last_name), alumni:alumni_profiles(serving_as, serving_at, location))",
      )
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Load testimonies error:", error);
      toast.error("Could not load the testimonies");
    }
    setRows((data ?? []) as unknown as Testimony[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (row: Testimony, status: "approved" | "hidden") => {
    setBusyId(row.id);
    const { error } = await supabase
      .from("alumni_testimonies")
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      console.error("Review testimony error:", error);
      toast.error("Could not save the decision");
      return;
    }
    toast.success(status === "approved" ? "Testimony is now on the wall" : "Testimony is not shown");
    void load();
  };

  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("alumni_testimonies").delete().eq("id", deleting.id);
    setDeleting(null);
    if (error) {
      toast.error("Could not delete the testimony");
      return;
    }
    toast.success("Testimony deleted");
    void load();
  };

  if (loading) return <PageSkeleton panels={1} />;

  const name = (row: Testimony) =>
    [row.student?.profile?.first_name, row.student?.profile?.last_name].filter(Boolean).join(" ") || "Unknown graduate";

  const list = (status: string) => {
    const shown = rows.filter((row) => row.status === status);
    if (shown.length === 0) return <p className="p-5 text-sm text-muted-foreground">Nothing here.</p>;
    return (
      <ul className="divide-y divide-border">
        {shown.map((row) => (
          <li key={row.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">{name(row)}</strong>
              <span className="text-xs text-muted-foreground">
                {[row.student?.cohort?.name, row.student?.alumni && servingLine(row.student.alumni), format(new Date(row.created_at), "d MMM yyyy")]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <StatusPill tone={TONE[row.status] ?? "neutral"}>{testimonyStatusLabel(row.status)}</StatusPill>
            </div>
            <p className="whitespace-pre-wrap text-sm">{row.body}</p>
            <div className="flex flex-wrap gap-2">
              {row.status !== "approved" && (
                <Button size="sm" className={APPROVE_BUTTON} disabled={busyId === row.id} onClick={() => setStatus(row, "approved")}>
                  Approve and show
                </Button>
              )}
              {row.status !== "hidden" && (
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => setStatus(row, "hidden")}>
                  {row.status === "approved" ? "Take off the wall" : "Do not show"}
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => setDeleting(row)}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const count = (status: string) => rows.filter((row) => row.status === status).length;

  return (
    <div className="space-y-5 pb-6">
      <AdminPageHeader
        section="People"
        title="Alumni"
        description="Testimonies graduates have shared. An approved testimony appears on the Graduates page for every student."
      />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">To review ({count("pending")})</TabsTrigger>
          <TabsTrigger value="approved">On the wall ({count("approved")})</TabsTrigger>
          <TabsTrigger value="hidden">Not shown ({count("hidden")})</TabsTrigger>
        </TabsList>
        {["pending", "approved", "hidden"].map((status) => (
          <TabsContent key={status} value={status}>
            <Panel>{list(status)}</Panel>
          </TabsContent>
        ))}
      </Tabs>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this testimony?"
        description="It is removed for good. To keep it but stop showing it, use Take off the wall instead."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
};

export default AdminAlumni;
