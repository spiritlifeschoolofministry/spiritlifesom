import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Search, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
};

const DB_TO_UI_STATUS: Record<string, string> = {
  PENDING: "Pending",
  ADMITTED: "Approved",
  REJECTED: "Rejected",
};

const AdminStudents = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

      const { error } = await supabase
        .from("students")
        .update({ admission_status: dbStatus })
        .eq("id", studentId);

      if (error) throw error;

      // Refresh list from server to keep in sync
      await loadStudents();

      if (dbStatus === "ADMITTED") {
        toast.success("Student Admitted Successfully");
      } else {
        toast.success("Status updated successfully");
      }
    } catch (err) {
      console.error("Update status error:", err);
      if (err && typeof err === "object" && "message" in (err as any)) {
        console.error("Supabase error message:", (err as any).message);
      }
      toast.error("Failed to update status");
    }
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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Student Management</h1>
        <p className="text-muted-foreground text-sm mt-1">View and manage all students</p>
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
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No students found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">
                        {student.profile.first_name} {student.profile.last_name}
                      </TableCell>
                      <TableCell>{student.profile.email}</TableCell>
                      <TableCell>
                        <Select
                          value={
                            DB_TO_UI_STATUS[(student.admission_status || "").toUpperCase()] ||
                            "Pending"
                          }
                          onValueChange={(value) => handleStatusChange(student.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
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
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Send Email</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminStudents;
