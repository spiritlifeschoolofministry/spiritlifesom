import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TESTIMONY_MIN_LENGTH, testimonyProblem, testimonyStatusLabel } from "@/lib/alumni";
import type { Tables } from "@/integrations/supabase/types";

/**
 * A graduate's own corner of the Graduates page: where they serve now (shown
 * on their directory card) and the testimonies they have shared.
 */
const AlumniCorner = ({ studentId, onChanged }: { studentId: string; onChanged: () => void }) => {
  const [servingAs, setServingAs] = useState("");
  const [servingAt, setServingAt] = useState("");
  const [location, setLocation] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [testimony, setTestimony] = useState("");
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<Tables<"alumni_testimonies">[]>([]);

  const load = useCallback(async () => {
    const [detailsRes, mineRes] = await Promise.all([
      supabase.from("alumni_profiles").select("*").eq("student_id", studentId).maybeSingle(),
      supabase.from("alumni_testimonies").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
    ]);
    if (detailsRes.data) {
      setServingAs(detailsRes.data.serving_as ?? "");
      setServingAt(detailsRes.data.serving_at ?? "");
      setLocation(detailsRes.data.location ?? "");
    }
    setMine(mineRes.data ?? []);
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingDetails(true);
    const { error } = await supabase.from("alumni_profiles").upsert({
      student_id: studentId,
      serving_as: servingAs.trim() || null,
      serving_at: servingAt.trim() || null,
      location: location.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setSavingDetails(false);
    if (error) {
      console.error("Save alumni details error:", error);
      toast.error("Could not save your details");
      return;
    }
    toast.success("Saved. Your card in the directory is updated");
    onChanged();
  };

  const share = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = testimonyProblem(testimony);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSending(true);
    const { error } = await supabase.from("alumni_testimonies").insert({ student_id: studentId, body: testimony.trim() });
    setSending(false);
    if (error) {
      console.error("Share testimony error:", error);
      toast.error("Could not send your testimony");
      return;
    }
    setTestimony("");
    toast.success("Thank you. It will appear on the wall once the school approves it");
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("alumni_testimonies").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete it");
      return;
    }
    toast.success("Testimony deleted");
    void load();
    onChanged();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Where you serve now</CardTitle>
          <CardDescription>Shown on your card in the graduates directory. Leave a field empty to hide it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDetails} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="alumni-serving-as">Your role</Label>
              <Input id="alumni-serving-as" value={servingAs} onChange={(e) => setServingAs(e.target.value)} maxLength={120} placeholder="For example: Youth pastor" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alumni-serving-at">Church or ministry</Label>
              <Input id="alumni-serving-at" value={servingAt} onChange={(e) => setServingAt(e.target.value)} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alumni-location">City and country</Label>
              <Input id="alumni-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
            </div>
            <Button type="submit" disabled={savingDetails}>
              {savingDetails && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Share a testimony</CardTitle>
          <CardDescription>Tell current students what God has done since you graduated. The school reads it before it goes on the wall.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={share} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="alumni-testimony">Your testimony</Label>
              <Textarea id="alumni-testimony" value={testimony} onChange={(e) => setTestimony(e.target.value)} rows={5} minLength={TESTIMONY_MIN_LENGTH} maxLength={3000} />
            </div>
            <Button type="submit" disabled={sending || !testimony.trim()}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send for approval
            </Button>
          </form>
          {mine.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Your testimonies</h3>
              <ul className="mt-2 space-y-2">
                {mine.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0">
                      <Badge variant="secondary" className="text-xs">{testimonyStatusLabel(row.status)}</Badge>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{row.body}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Delete testimony" onClick={() => remove(row.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AlumniCorner;
