import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, BookOpen, Search } from "lucide-react";

interface Course {
  id: string;
  code: string;
  title: string;
  description: string | null;
  cohort_id: string | null;
  lecturer: string | null;
  is_completed: boolean | null;
  start_date: string | null;
  created_at: string | null;
  semester: number | null;
}

interface Cohort {
  id: string;
  name: string;
}

const emptyCourse = {
  code: "",
  title: "",
  description: "",
  cohort_id: "",
  lecturer: "",
  is_completed: false,
  start_date: "",
  semester: 1 as number,
};

const AdminCourses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [form, setForm] = useState(emptyCourse);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [coursesRes, cohortsRes] = await Promise.all([
      supabase.from("courses").select("*").order("semester", { ascending: true }).order("code", { ascending: true }),
      supabase.from("cohorts").select("id, name").order("name"),
    ]);
    if (coursesRes.data) setCourses(coursesRes.data as Course[]);
    if (cohortsRes.data) setCohorts(cohortsRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditingCourse(null);
    setForm(emptyCourse);
    setDialogOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditingCourse(course);
    setForm({
      code: course.code,
      title: course.title,
      description: course.description || "",
      cohort_id: course.cohort_id || "",
      lecturer: course.lecturer || "",
      is_completed: course.is_completed || false,
      start_date: course.start_date || "",
      semester: (course.semester ?? 1) as number,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.title.trim()) {
      toast.error("Code and title are required");
      return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      cohort_id: form.cohort_id || null,
      lecturer: form.lecturer.trim() || null,
      is_completed: form.is_completed,
      start_date: form.start_date || null,
      semester: form.semester || 1,
    };

    if (editingCourse) {
      const { error } = await supabase.from("courses").update(payload).eq("id", editingCourse.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Course updated");
    } else {
      const { error } = await supabase.from("courses").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Course created");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this course? This cannot be undone.")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Course deleted");
    fetchData();
  };

  const toggleCompleted = async (course: Course) => {
    const { error } = await supabase.from("courses").update({ is_completed: !course.is_completed }).eq("id", course.id);
    if (error) { toast.error(error.message); return; }
    setCourses(prev => prev.map(c => c.id === course.id ? { ...c, is_completed: !c.is_completed } : c));
  };

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.lecturer || "").toLowerCase().includes(search.toLowerCase())
  );

  const getCohortName = (id: string | null) => cohorts.find(c => c.id === id)?.name || "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" /> Courses Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{courses.length} course{courses.length !== 1 ? "s" : ""} total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search courses…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gradient-flame border-0 text-primary-foreground">
                <Plus className="w-4 h-4 mr-1" /> Add Course
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
              <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
                <DialogTitle>{editingCourse ? "Edit Course" : "New Course"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Course Code *</Label>
                    <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="SLSM101" />
                  </div>
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Course title" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Lecturer</Label>
                    <Input value={form.lecturer} onChange={e => setForm(f => ({ ...f, lecturer: e.target.value }))} placeholder="Lecturer name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cohort</Label>
                    <Select value={form.cohort_id} onValueChange={v => setForm(f => ({ ...f, cohort_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
                      <SelectContent>
                        {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Semester</Label>
                    <Select value={String(form.semester)} onValueChange={v => setForm(f => ({ ...f, semester: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">First Semester</SelectItem>
                        <SelectItem value="2">Second Semester</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_completed} onCheckedChange={v => setForm(f => ({ ...f, is_completed: v }))} />
                  <Label>Completed</Label>
                </div>
                <div className="sticky bottom-0 bg-background pt-4 border-t">
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? "Saving…" : editingCourse ? "Update Course" : "Create Course"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {search ? "No courses match your search." : "No courses yet. Click \"Add Course\" to create one."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Sem</TableHead>
                  <TableHead className="hidden md:table-cell">Lecturer</TableHead>
                  <TableHead className="hidden lg:table-cell">Cohort</TableHead>
                  <TableHead className="hidden lg:table-cell">Start Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(course => (
                  <TableRow key={course.id}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">{course.code}</TableCell>
                    <TableCell className="font-medium">{course.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {course.semester === 2 ? "2nd" : "1st"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{course.lecturer || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{getCohortName(course.cohort_id)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {course.start_date ? new Date(course.start_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell>
                      <button onClick={() => toggleCompleted(course)} className="cursor-pointer">
                        <Badge variant={course.is_completed ? "default" : "secondary"} className={course.is_completed ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                          {course.is_completed ? "Completed" : "In Progress"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(course)} title="Edit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(course.id)} title="Delete" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminCourses;
