import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { invalidateSiteContentCache } from "@/hooks/use-site-content";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ContentItem {
  id: string;
  page: string;
  section_key: string;
  label: string;
  content: string;
}

const PAGES = ["home", "about", "courses", "faculty", "contact"];

const SiteContentEditor = () => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedItems, setEditedItems] = useState<Record<string, string>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activePage, setActivePage] = useState("home");
  const [newItem, setNewItem] = useState({ page: "home", section_key: "", label: "", content: "" });

  useEffect(() => { loadContent(); }, []);

  const loadContent = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_content")
      .select("id, page, section_key, label, content")
      .order("page")
      .order("section_key");
    if (error) { toast.error("Failed to load content"); return; }
    setItems((data as ContentItem[]) || []);
    setEditedItems({});
    setLoading(false);
  };

  const handleEdit = (id: string, value: string) => {
    setEditedItems(prev => ({ ...prev, [id]: value }));
  };

  const saveItem = async (item: ContentItem) => {
    const newContent = editedItems[item.id];
    if (newContent === undefined) return;
    setSaving(item.id);
    const { error } = await supabase
      .from("site_content")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) { toast.error("Failed to save"); }
    else {
      toast.success(`"${item.label}" updated`);
      invalidateSiteContentCache(item.page);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, content: newContent } : i));
      setEditedItems(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    }
    setSaving(null);
  };

  const saveAll = async () => {
    const ids = Object.keys(editedItems);
    if (ids.length === 0) return;
    setSaving("all");
    for (const id of ids) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      await supabase
        .from("site_content")
        .update({ content: editedItems[id], updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    invalidateSiteContentCache();
    toast.success(`${ids.length} items saved`);
    await loadContent();
    setSaving(null);
  };

  const addItem = async () => {
    if (!newItem.section_key || !newItem.label) { toast.error("Fill key and label"); return; }
    setSaving("add");
    const { error } = await supabase.from("site_content").insert({
      page: newItem.page,
      section_key: newItem.section_key,
      label: newItem.label,
      content: newItem.content,
    });
    if (error) toast.error("Failed to add: " + error.message);
    else {
      toast.success("Content added");
      invalidateSiteContentCache(newItem.page);
      setShowAddDialog(false);
      setNewItem({ page: "home", section_key: "", label: "", content: "" });
      await loadContent();
    }
    setSaving(null);
  };

  const deleteItem = async (item: ContentItem) => {
    if (!confirm(`Delete "${item.label}" from ${item.page}?`)) return;
    const { error } = await supabase.from("site_content").delete().eq("id", item.id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      invalidateSiteContentCache(item.page);
      setItems(prev => prev.filter(i => i.id !== item.id));
    }
  };

  const changedCount = Object.keys(editedItems).length;

  if (loading) return (
    <Card>
      <CardContent className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Site Content Manager</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Edit text displayed on public pages (Home, About, Courses, Faculty, Contact)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setNewItem({ ...newItem, page: activePage }); setShowAddDialog(true); }} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
          {changedCount > 0 && (
            <Button size="sm" onClick={saveAll} disabled={saving === "all"} className="gap-1.5">
              {saving === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save All ({changedCount})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activePage} onValueChange={setActivePage}>
          <TabsList className="mb-4 flex-wrap h-auto">
            {PAGES.map(p => (
              <TabsTrigger key={p} value={p} className="capitalize">{p}</TabsTrigger>
            ))}
          </TabsList>
          {PAGES.map(page => {
            const pageItems = items.filter(i => i.page === page);
            return (
              <TabsContent key={page} value={page} className="space-y-3">
                {pageItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No content entries for this page</p>
                ) : (
                  pageItems.map(item => {
                    const currentValue = editedItems[item.id] ?? item.content;
                    const isChanged = editedItems[item.id] !== undefined;
                    const isLong = item.content.length > 100;
                    return (
                      <div key={item.id} className={`p-4 border rounded-lg space-y-2 ${isChanged ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">{item.label}</Label>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground font-mono">{item.section_key}</span>
                            {isChanged && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditedItems(prev => { const n = { ...prev }; delete n[item.id]; return n; })}>
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                            {isChanged && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => saveItem(item)} disabled={saving === item.id}>
                                {saving === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteItem(item)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {isLong ? (
                          <Textarea
                            value={currentValue}
                            onChange={e => handleEdit(item.id, e.target.value)}
                            rows={4}
                            className="text-sm"
                          />
                        ) : (
                          <Input
                            value={currentValue}
                            onChange={e => handleEdit(item.id, e.target.value)}
                            className="text-sm"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>

      {/* Add content dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Content Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Page</Label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={newItem.page}
                onChange={e => setNewItem({ ...newItem, page: e.target.value })}
              >
                {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <Label>Section Key</Label>
              <Input
                placeholder="e.g. hero_title"
                value={newItem.section_key}
                onChange={e => setNewItem({ ...newItem, section_key: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Unique identifier (lowercase, underscores)</p>
            </div>
            <div>
              <Label>Label</Label>
              <Input
                placeholder="e.g. Hero Title"
                value={newItem.label}
                onChange={e => setNewItem({ ...newItem, label: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                placeholder="Enter text content..."
                value={newItem.content}
                onChange={e => setNewItem({ ...newItem, content: e.target.value })}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={addItem} disabled={saving === "add"} className="gap-1.5">
              {saving === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SiteContentEditor;
