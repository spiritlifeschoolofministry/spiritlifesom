import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MoreHorizontal, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Student {
  id: string;
  admission_status: string | null;
  created_at: string | null;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

const UI_TO_DB_STATUS: Record<string, string> = {
  Pending: "PENDING",
  Approved: "ADMITTED",
  Rejected: "REJECTED",
  Graduate: "Graduate",
};

const DB_TO_UI_STATUS: Record<string, string> = {
  PENDING: "Pending",
  ADMITTED: "Approved",
  REJECTED: "Rejected",
  GRADUATE: "Graduate",
};

const AdminStudents = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Bulk graduation state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkGraduateDialog, setShowBulkGraduateDialog] = useState(false);
  const [bulkGraduating, setBulkGraduating] = useState(false);
  const [graduatingId, setGraduatingId] = useState<string | null>(null);

  useEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    filterStudents();
  }, [students, searchQuery, statusFilter]);

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from("students")
        .select(`
          id,
          admission_status,
          created_at,
          profile:profiles(first_name, last_name, email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStudents((data as any) || []);
    } catch (err) {
      console.error("Load students error:", err);
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const filterStudents = () => {
    let filtered = [...students];

    if (searchQuery) {
      filtered = filtered.filter((s) => {
        const searchLower = searchQuery.toLowerCase();
        return (
          s.profile.first_name.toLowerCase().includes(searchLower) ||
          s.profile.last_name.toLowerCase().includes(searchLower) ||
          s.profile.email.toLowerCase().includes(searchLower)
        );
      });
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((s) => {
        const uiStatus = DB_TO_UI_STATUS[(s.admission_status || "").toUpperCase()] || "Pending";
        return uiStatus === statusFilter;
      });
    }

    setFilteredStudents(filtered);
  };

  const handleStatusChange = async (studentId: string, newStatus: string) => {
    try {
      const dbStatus = UI_TO_DB_STATUS[newStatus] || "PENDING";
      const is_approved = dbStatus === "ADMITTED";

      const { error } = await supabase
        .from("students")
        .update({ admission_status: dbStatus, is_approved })
        .eq("id", studentId);

      if (error) {
        toast.error(error.message || "Failed to update student status");
        return;
      }

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, admission_status: dbStatus } : s
        )
      );

      toast.success(`Student marked as ${newStatus}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update student status";
      toast.error(msg);
    }
  };

  const handleGraduateSingle = async (studentId: string) => {
    try {
      setGraduatingId(studentId);
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "Graduate", is_approved: true })
        .eq("id", studentId);

      if (error) throw error;

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, admission_status: "Graduate" } : s
        )
      );
      toast.success("Student marked as Graduate 🎓");
    } catch (err) {
      toast.error("Failed to graduate student");
    } finally {
      setGraduatingId(null);
    }
  };

  const handleBulkGraduate = async () => {
    if (selectedIds.size === 0) return;
    try {
      setBulkGraduating(true);
      const ids = Array.from(selectedIds);

      const { error } = await supabase
        .from("students")
        .update({ admission_status: "Graduate", is_approved: true })
        .in("id", ids);

      if (error) throw error;

      setStudents((prev) =>
        prev.map((s) =>
          selectedIds.has(s.id) ? { ...s, admission_status: "Graduate" } : s
        )
      );

      toast.success(`${ids.length} student(s) marked as Graduate 🎓`);
      setSelectedIds(new Set());
      setShowBulkGraduateDialog(false);
    } catch (err) {
      toast.error("Failed to graduate students");
    } finally {
      setBulkGraduating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  const getStatusForUI = (status: string | null) => {
    return DB_TO_UI_STATUS[(status || "").toUpperCase()] || "Pending";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Student Management</h1>
          <p className="text-muted-foreground text-sm mt-1">View and manage all students</p>
        </div>
        {selectedIds.size > 0 && (
          <Button
            onClick={() => setShowBulkGraduateDialog(true)}
            className="gap-2"
          >
            <GraduationCap className="h-4 w-4" />
            Graduate Selected ({selectedIds.size})
          </Button>
        )}
      </div>

      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader>
          <CardTitle className="text-base">All Students</CardTitle>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Graduate">Graduate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredStudents.length > 0 && selectedIds.size === filteredStudents.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Admission Status</TableHead>
                  <TableHead>Date Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No students found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((student) => {
                    const uiStatus = getStatusForUI(student.admission_status);
                    const isGraduate = uiStatus === "Graduate";

                    return (
                      <TableRow key={student.id} className={selectedIds.has(student.id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(student.id)}
                            onCheckedChange={() => toggleSelect(student.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {student.profile.first_name} {student.profile.last_name}
                          {isGraduate && <GraduationCap className="inline ml-1.5 h-4 w-4 text-primary" />}
                        </TableCell>
                        <TableCell>{student.profile.email}</TableCell>
                        <TableCell>
                          <Select
                            value={uiStatus}
                            onValueChange={(value) => handleStatusChange(student.id, value)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pending">Pending</SelectItem>
                              <SelectItem value="Approved">Approved</SelectItem>
                              <SelectItem value="Rejected">Rejected</SelectItem>
                              <SelectItem value="Graduate">Graduate</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {student.created_at
                            ? new Date(student.created_at).toLocaleDateString()
                            : "N/A"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isGraduate && (
                                <DropdownMenuItem
                                  onClick={() => handleGraduateSingle(student.id)}
                                  disabled={graduatingId === student.id}
                                >
                                  <GraduationCap className="mr-2 h-4 w-4" />
                                  {graduatingId === student.id ? "Graduating..." : "Mark as Graduate"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Send Email</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Graduate Confirmation Dialog */}
      <Dialog open={showBulkGraduateDialog} onOpenChange={setShowBulkGraduateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" /> Confirm Bulk Graduation
            </DialogTitle>
            <DialogDescription>
              You are about to mark <strong>{selectedIds.size}</strong> student(s) as Graduate. This will update their admission status. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto space-y-1 my-2">
            {filteredStudents
              .filter((s) => selectedIds.has(s.id))
              .map((s) => (
                <p key={s.id} className="text-sm text-muted-foreground">
                  • {s.profile.first_name} {s.profile.last_name}
                </p>
              ))}
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowBulkGraduateDialog(false)}>Cancel</Button>
            <Button onClick={handleBulkGraduate} disabled={bulkGraduating} className="gap-2">
              {bulkGraduating ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
              {bulkGraduating ? "Graduating..." : "Confirm Graduation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminStudents;
