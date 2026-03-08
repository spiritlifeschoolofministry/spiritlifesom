import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, BookOpen,
  GraduationCap, CreditCard, ClipboardCheck, User2, Pencil, Save, Loader2, X
} from "lucide-react";

interface StudentDetail {
  id: string;
  admission_status: string | null;
  learning_mode: string | null;
  gender: string | null;
  age: number | null;
  date_of_birth: string | null;
  marital_status: string | null;
  address: string | null;
  educational_background: string | null;
  preferred_language: string | null;
  is_born_again: boolean | null;
  has_discovered_ministry: boolean | null;
  ministry_description: string | null;
  student_code: string | null;
  created_at: string | null;
  cohort_id: string | null;
  fees_paid: number | null;
  total_fees_due: number | null;
  bio: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    middle_name: string | null;
    email: string;
    phone: string | null;
    avatar_url: string | null;
  };
  cohort: { name: string } | null;
}

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
}

interface FeeRecord {
  id: string;
  fee_type: string;
  amount_due: number | null;
  amount_paid: number | null;
  payment_status: string | null;
}

interface AssignmentRecord {
  id: string;
  title: string;
  category: string;
  max_points: number | null;
  grade: number | null;
  submitted: boolean;
}

const LEARNING_MODES = ["On-site", "Online", "Hybrid"];
const LANGUAGES = ["English", "French", "Yoruba", "Igbo", "Hausa", "Other"];
const EDUCATION_LEVELS = ["Primary", "Secondary", "Diploma", "Bachelor's Degree", "Master's Degree", "Doctorate", "Other"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];
const ADMISSION_STATUSES = ["Pending", "ADMITTED", "REJECTED", "Graduate"];

interface CohortOption {
  id: string;
  name: string;
}

const AdminAcademicEditCard = ({ student, onSaved }: { student: StudentDetail; onSaved: (s: StudentDetail) => void }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [form, setForm] = useState({
    learning_mode: student.learning_mode || "",
    preferred_language: student.preferred_language || "",
    educational_background: student.educational_background || "",
    marital_status: student.marital_status || "",
    address: student.address || "",
    ministry_description: student.ministry_description || "",
    admission_status: student.admission_status || "Pending",
    cohort_id: student.cohort_id || "",
  });

  useEffect(() => {
    supabase.from("cohorts").select("id, name").order("name").then(({ data }) => {
      if (data) setCohorts(data);
    });
  }, []);

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error: updateError } = await supabase
        .from("students")
        .update({
          learning_mode: form.learning_mode || null,
          preferred_language: form.preferred_language || null,
          educational_background: form.educational_background || null,
          marital_status: form.marital_status || null,
          address: form.address || null,
          ministry_description: form.ministry_description || null,
          admission_status: form.admission_status || null,
          cohort_id: form.cohort_id || null,
        })
        .eq("id", student.id);
      if (updateError) throw updateError;

      const { data, error: fetchError } = await supabase
        .from("students")
        .select(`*, profile:profiles(first_name, last_name, middle_name, email, phone, avatar_url), cohort:cohorts(name)`)
        .eq("id", student.id)
        .single();
      if (fetchError) throw fetchError;
      if (data) onSaved(data as any);
      toast.success("Student academic info updated");
      setEditing(false);
    } catch (err: any) {
      console.error('[AdminEdit] Update error:', err);
      toast.error(err?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setEditing(false);
    setForm({
      learning_mode: student.learning_mode || "",
      preferred_language: student.preferred_language || "",
      educational_background: student.educational_background || "",
      marital_status: student.marital_status || "",
      address: student.address || "",
      ministry_description: student.ministry_description || "",
      admission_status: student.admission_status || "Pending",
      cohort_id: student.cohort_id || "",
    });
  };

  return (
    <Card className="shadow-[var(--shadow-card)] border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Academic Profile</CardTitle>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Cohort</Label>
                <Select value={form.cohort_id} onValueChange={v => set("cohort_id", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select cohort" /></SelectTrigger>
                  <SelectContent>{cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Learning Mode</Label>
                <Select value={form.learning_mode} onValueChange={v => set("learning_mode", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{LEARNING_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Preferred Language</Label>
                <Select value={form.preferred_language} onValueChange={v => set("preferred_language", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Educational Background</Label>
                <Select value={form.educational_background} onValueChange={v => set("educational_background", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{EDUCATION_LEVELS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Marital Status</Label>
                <Select value={form.marital_status} onValueChange={v => set("marital_status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{MARITAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Admission Status</Label>
                <Select value={form.admission_status} onValueChange={v => set("admission_status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{ADMISSION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={e => set("address", e.target.value)} className="mt-1" placeholder="Student address" />
            </div>
            <div>
              <Label className="text-xs">Ministry Description</Label>
              <Textarea value={form.ministry_description} onChange={e => set("ministry_description", e.target.value)} className="mt-1" rows={3} placeholder="Ministry involvement" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={cancel}>
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            {[
              { label: "Cohort", value: student.cohort?.name },
              { label: "Learning Mode", value: student.learning_mode },
              { label: "Preferred Language", value: student.preferred_language },
              { label: "Educational Background", value: student.educational_background },
              { label: "Marital Status", value: student.marital_status },
              { label: "Student Code", value: student.student_code },
              { label: "Admission Status", value: student.admission_status },
              { label: "Address", value: student.address },
              { label: "Ministry Description", value: student.ministry_description },
            ].map(item => (
              <div key={item.label} className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                <p className="text-sm font-medium text-foreground capitalize">{item.value || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};


const AdminStudentProfile = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary>({ total: 0, present: 0, absent: 0, late: 0 });
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    loadStudentData();
  }, [studentId]);

  const loadStudentData = async () => {
    try {
      const [studentRes, attendanceRes, feesRes, assignmentsRes] = await Promise.all([
        supabase
          .from("students")
          .select(`
            *, 
            profile:profiles(first_name, last_name, middle_name, email, phone, avatar_url),
            cohort:cohorts(name)
          `)
          .eq("id", studentId!)
          .maybeSingle(),
        supabase
          .from("attendance")
          .select("status")
          .eq("student_id", studentId!),
        supabase
          .from("fees")
          .select("id, fee_type, amount_due, amount_paid, payment_status")
          .eq("student_id", studentId!),
        supabase
          .from("assignment_submissions")
          .select("id, grade, assignment:assignments(title, category, max_points)")
          .eq("student_id", studentId!),
      ]);

      if (studentRes.data) {
        setStudent(studentRes.data as any);
      }

      if (attendanceRes.data) {
        const att = attendanceRes.data;
        setAttendance({
          total: att.length,
          present: att.filter(a => a.status === "Present").length,
          absent: att.filter(a => a.status === "Absent").length,
          late: att.filter(a => a.status === "Late").length,
        });
      }

      if (feesRes.data) setFees(feesRes.data);

      if (assignmentsRes.data) {
        setAssignments(
          (assignmentsRes.data as any[]).map(s => ({
            id: s.id,
            title: s.assignment?.title || "Unknown",
            category: s.assignment?.category || "Task",
            max_points: s.assignment?.max_points || 100,
            grade: s.grade,
            submitted: true,
          }))
        );
      }
    } catch (err) {
      console.error("Error loading student:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Student not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/students")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Students
        </Button>
      </div>
    );
  }

  const p = student.profile;
  const fullName = `${p?.first_name || ""} ${p?.middle_name || ""} ${p?.last_name || ""}`.trim() || "Unknown";
  const initials = `${p?.first_name?.[0] || ""}${p?.last_name?.[0] || ""}`;

  const statusColor: Record<string, string> = {
    ADMITTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    REJECTED: "bg-destructive/10 text-destructive",
    Graduate: "bg-primary/10 text-primary",
  };

  const attendanceRate = attendance.total > 0
    ? Math.round((attendance.present / attendance.total) * 100)
    : 0;

  const totalFeesDue = fees.reduce((sum, f) => sum + (f.amount_due || 0), 0);
  const totalFeesPaid = fees.reduce((sum, f) => sum + (f.amount_paid || 0), 0);
  const feeProgress = totalFeesDue > 0 ? Math.round((totalFeesPaid / totalFeesDue) * 100) : 0;

  const avgGrade = assignments.length > 0
    ? Math.round(assignments.filter(a => a.grade !== null).reduce((s, a) => s + (a.grade || 0), 0) / Math.max(1, assignments.filter(a => a.grade !== null).length))
    : null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/students")} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to Students
      </Button>

      {/* Profile header */}
      <Card className="shadow-[var(--shadow-card)] border-border overflow-hidden">
        <div className="h-2 gradient-flame" />
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
              {p?.avatar_url && <AvatarImage src={p.avatar_url} />}
              <AvatarFallback className="text-xl font-bold bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-foreground">{fullName}</h1>
                <Badge className={statusColor[student.admission_status || "PENDING"] || statusColor.PENDING}>
                  {student.admission_status || "Pending"}
                </Badge>
              </div>
              {student.student_code && (
                <p className="text-sm text-muted-foreground font-mono mb-2">{student.student_code}</p>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                {p?.email && (
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {p.email}</span>
                )}
                {p?.phone && (
                  <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {p.phone}</span>
                )}
                {student.cohort?.name && (
                  <span className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> {student.cohort.name}</span>
                )}
                {student.learning_mode && (
                  <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> {student.learning_mode}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Attendance", value: `${attendanceRate}%`, icon: ClipboardCheck, color: "text-emerald-600" },
          { label: "Tasks", value: String(assignments.length), icon: BookOpen, color: "text-primary" },
          { label: "Avg Grade", value: avgGrade !== null ? `${avgGrade}%` : "—", icon: GraduationCap, color: "text-amber-600" },
          { label: "Fee Progress", value: `${feeProgress}%`, icon: CreditCard, color: "text-primary" },
        ].map(stat => (
          <Card key={stat.label} className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`w-5 h-5 ${stat.color} shrink-0`} />
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="personal"><User2 className="w-4 h-4 mr-1.5" /> Personal</TabsTrigger>
          <TabsTrigger value="academic"><BookOpen className="w-4 h-4 mr-1.5" /> Academic</TabsTrigger>
          <TabsTrigger value="fees"><CreditCard className="w-4 h-4 mr-1.5" /> Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {[
                  { label: "Gender", value: student.gender },
                  { label: "Age", value: student.age ? String(student.age) : null },
                  { label: "Date of Birth", value: student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : null },
                  { label: "Marital Status", value: student.marital_status },
                  { label: "Address", value: student.address },
                  { label: "Born Again", value: student.is_born_again ? "Yes" : "No" },
                  { label: "Discovered Ministry", value: student.has_discovered_ministry ? "Yes" : "No" },
                  { label: "Joined", value: student.created_at ? new Date(student.created_at).toLocaleDateString() : null },
                ].map(item => (
                  <div key={item.label} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                    <p className="text-sm text-foreground">{item.value || "—"}</p>
                  </div>
                ))}
              </div>
              {student.ministry_description && (
                <div className="mt-4 pt-4 border-t border-border space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium">Ministry Description</p>
                  <p className="text-sm text-foreground">{student.ministry_description}</p>
                </div>
              )}
              {student.bio && (
                <div className="mt-4 pt-4 border-t border-border space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium">Bio</p>
                  <p className="text-sm text-foreground">{student.bio}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academic">
          <div className="space-y-4">
            {/* Academic Profile - Editable */}
            <AdminAcademicEditCard student={student} onSaved={(updated) => setStudent(updated as any)} />

            {/* Attendance */}
            <Card className="shadow-[var(--shadow-card)] border-border">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Attendance</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overall Rate</span>
                  <span className="font-semibold text-foreground">{attendanceRate}%</span>
                </div>
                <Progress value={attendanceRate} className="h-2" />
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{attendance.present}</p>
                    <p className="text-xs text-muted-foreground">Present</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600">{attendance.late}</p>
                    <p className="text-xs text-muted-foreground">Late</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-destructive">{attendance.absent}</p>
                    <p className="text-xs text-muted-foreground">Absent</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assignments */}
            <Card className="shadow-[var(--shadow-card)] border-border">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4" /> Task Submissions</CardTitle></CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No submissions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map(a => (
                      <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{a.category}</p>
                        </div>
                        <Badge variant={a.grade !== null ? (a.grade >= (a.max_points || 100) * 0.5 ? "default" : "destructive") : "secondary"}>
                          {a.grade !== null ? `${a.grade}/${a.max_points}` : "Ungraded"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fees">
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Fee Records</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Payment Progress</span>
                <span className="font-semibold text-foreground">₦{totalFeesPaid.toLocaleString()} / ₦{totalFeesDue.toLocaleString()}</span>
              </div>
              <Progress value={feeProgress} className="h-2" />

              {fees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fee records found.</p>
              ) : (
                <div className="space-y-2 mt-4">
                  {fees.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div>
                        <p className="text-sm font-medium text-foreground">{f.fee_type}</p>
                        <p className="text-xs text-muted-foreground">
                          ₦{(f.amount_paid || 0).toLocaleString()} of ₦{(f.amount_due || 0).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={f.payment_status === "Paid" ? "default" : f.payment_status === "Partial" ? "secondary" : "destructive"}>
                        {f.payment_status || "Unpaid"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminStudentProfile;
