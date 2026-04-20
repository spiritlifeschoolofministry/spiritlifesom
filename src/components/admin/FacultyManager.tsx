import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";

interface FacultyMember {
  id: string;
  name: string;
  title: string;
  bio: string;
  photo_url: string | null;
  display_order: number;
  is_active: boolean;
}

const empty: Omit<FacultyMember, "id"> = {
  name: "",
  title: "",
  bio: "",
  photo_url: "",
  display_order: 0,
  is_active: true,
};

const FacultyManager = () => {
  const [items, setItems] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FacultyMember | null>(null);
  const [form, setForm] = useState<Omit<FacultyMember, "id">>(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("faculty_members")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) toast.error(error.message);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, display_order: items.length + 1 });
    setDialogOpen(true);
  };

  const openEdit = (m: FacultyMember) => {
    setEditing(m);
    setForm({
      name: m.name,
      title: m.title,
      bio: m.bio,
      photo_url: m.photo_url || "",
      display_order: m.display_order,
      is_active: m.is_active,
    });
    setDialogOpen(true);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `faculty/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((f) => ({ ...f, photo_url: data.publicUrl }));
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("faculty_members")
          .update(form)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { error } = await supabase.from("faculty_members").insert(form);
        if (error) throw error;
        toast.success("Faculty member added");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this faculty member?")) return;
    const { error } = await supabase.from("faculty_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Faculty Members</CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add Member
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No faculty members yet.</p>
        ) : (
          <div className="space-y-3">
            {items.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-4 p-3 border border-border rounded-lg bg-card"
              >
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name} className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                    {m.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Order: {m.display_order} · {m.is_active ? "Active" : "Hidden"}
                  </p>
                </div>
                <Button variant="outline" size="icon" onClick={() => openEdit(m)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Faculty Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {form.photo_url ? (
                <img src={form.photo_url} alt="preview" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer">
                <span className="text-sm font-medium text-primary hover:underline">
                  {uploading ? "Uploading..." : "Upload photo"}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} disabled={uploading} />
              </label>
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <div>
              <Label>Photo URL (or upload above)</Label>
              <Input value={form.photo_url || ""} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label className="mb-2">Active (visible)</Label>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default FacultyManager;
