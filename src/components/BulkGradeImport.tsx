import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";

interface Props {
  assignments: Array<{ id: string; title: string; max_points: number; cohort_id: string }>;
  onImportComplete: () => void;
}

interface ParsedRow {
  email: string;
  score: number;
  feedback?: string;
  status?: "ready" | "error" | "imported";
  error?: string;
  studentId?: string;
}

const BulkGradeImport = ({ assignments, onImportComplete }: Props) => {
  const [open, setOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAssignment) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("File must have a header row and at least one data row");
      return;
    }

    // Parse header
    const sep = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const emailIdx = headers.findIndex((h) => h.includes("email"));
    const scoreIdx = headers.findIndex((h) => h.includes("score") || h.includes("grade") || h.includes("mark"));
    const feedbackIdx = headers.findIndex((h) => h.includes("feedback") || h.includes("comment"));

    if (emailIdx === -1 || scoreIdx === -1) {
      toast.error("CSV must have 'email' and 'score' columns");
      return;
    }

    // Look up all students in this cohort
    const { data: students } = await supabase
      .from("students")
      .select("id, profile_id, profiles(email)")
      .eq("cohort_id", selectedAssignment.cohort_id);

    const emailToStudent = new Map<string, string>();
    (students || []).forEach((s: any) => {
      if (s.profiles?.email) emailToStudent.set(s.profiles.email.toLowerCase(), s.id);
    });

    const parsed: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const email = (cols[emailIdx] || "").toLowerCase();
      const scoreRaw = parseFloat(cols[scoreIdx] || "");
      const feedback = feedbackIdx >= 0 ? cols[feedbackIdx] : undefined;

      if (!email) continue;

      const studentId = emailToStudent.get(email);
      if (!studentId) {
        parsed.push({ email, score: scoreRaw, feedback, status: "error", error: "Student not found in cohort" });
      } else if (isNaN(scoreRaw) || scoreRaw < 0 || scoreRaw > selectedAssignment.max_points) {
        parsed.push({ email, score: scoreRaw, feedback, status: "error", error: `Score must be 0-${selectedAssignment.max_points}`, studentId });
      } else {
        parsed.push({ email, score: scoreRaw, feedback, status: "ready", studentId });
      }
    }
    setRows(parsed);
  };

  const handleImport = async () => {
    if (!selectedAssignment) return;
    const ready = rows.filter((r) => r.status === "ready" && r.studentId);
    if (ready.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      let success = 0;
      const updatedRows = [...rows];

      for (const row of ready) {
        // Upsert: check if submission exists
        const { data: existing } = await supabase
          .from("assignment_submissions")
          .select("id")
          .eq("assignment_id", selectedAssignment.id)
          .eq("student_id", row.studentId!)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("assignment_submissions")
            .update({ grade: row.score, feedback: row.feedback || null, reviewed_at: new Date().toISOString(), reviewed_by: userId })
            .eq("id", existing.id);
        } else {
          await supabase.from("assignment_submissions").insert({
            assignment_id: selectedAssignment.id,
            student_id: row.studentId!,
            grade: row.score,
            feedback: row.feedback || null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: userId,
            submitted_at: new Date().toISOString(),
          });
        }
        const idx = updatedRows.findIndex((r) => r.email === row.email);
        if (idx >= 0) updatedRows[idx] = { ...updatedRows[idx], status: "imported" };
        success++;
      }

      setRows(updatedRows);
      toast.success(`Successfully imported ${success} grades`);
      onImportComplete();
    } catch (err) {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = "email,score,feedback\nstudent@example.com,85,Great work\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grade_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const readyCount = rows.filter((r) => r.status === "ready").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const importedCount = rows.filter((r) => r.status === "imported").length;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setRows([]); setSelectedAssignmentId(""); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" /> Bulk Import Grades
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Bulk Grade Import
          </DialogTitle>
          <DialogDescription>Upload a CSV file to mass-enter grades for an assignment.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Step 1: Select assignment */}
          <div>
            <Label>Select Assignment *</Label>
            <Select value={selectedAssignmentId} onValueChange={(v) => { setSelectedAssignmentId(v); setRows([]); }}>
              <SelectTrigger><SelectValue placeholder="Choose an assignment" /></SelectTrigger>
              <SelectContent>
                {assignments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.title} ({a.max_points} pts)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAssignmentId && (
            <>
              {/* Step 2: Upload */}
              <div className="space-y-2">
                <Label>Upload CSV File</Label>
                <p className="text-xs text-muted-foreground">
                  Required columns: <code className="bg-muted px-1 rounded">email</code>, <code className="bg-muted px-1 rounded">score</code>. Optional: <code className="bg-muted px-1 rounded">feedback</code>.
                </p>
                <div className="flex gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileChange}
                    className="flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:border file:border-border file:rounded file:text-xs file:bg-muted"
                  />
                  <Button variant="ghost" size="sm" onClick={handleDownloadTemplate} className="gap-1 text-xs whitespace-nowrap">
                    <Download className="h-3 w-3" /> Template
                  </Button>
                </div>
              </div>

              {/* Preview */}
              {rows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex gap-3 text-sm">
                    {readyCount > 0 && <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {readyCount} ready</Badge>}
                    {errorCount > 0 && <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> {errorCount} errors</Badge>}
                    {importedCount > 0 && <Badge className="gap-1 bg-emerald-600"><CheckCircle2 className="h-3 w-3" /> {importedCount} imported</Badge>}
                  </div>

                  <div className="overflow-x-auto max-h-64 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{r.email}</TableCell>
                            <TableCell className="text-sm font-medium">{isNaN(r.score) ? "—" : r.score}</TableCell>
                            <TableCell>
                              {r.status === "ready" && <Badge variant="secondary" className="text-xs">Ready</Badge>}
                              {r.status === "error" && <Badge variant="destructive" className="text-xs">{r.error}</Badge>}
                              {r.status === "imported" && <Badge className="text-xs bg-emerald-600">Imported</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {readyCount > 0 && importedCount === 0 && (
                    <Button onClick={handleImport} disabled={importing} className="w-full">
                      {importing ? "Importing..." : `Import ${readyCount} Grades`}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkGradeImport;
