import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Check, X, Eye, Search, Users, Clock, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Application {
  id: string;
  admission_status: string | null;
  created_at: string | null;
  learning_mode: string | null;
  is_born_again: boolean | null;
  has_discovered_ministry: boolean | null;
  gender: string | null;
  age: number | null;
  address: string | null;
  educational_background: string | null;
  preferred_language: string | null;
  ministry_description: string | null;
  marital_status: string | null;
  profile: {
    first_name: string;
    last_name: string;
    middle_name: string | null;
    email: string;
    phone: string | null;
  };
}

const AdminAdmissions = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      const { data, error } = await supabase
        .from("students")
        .select(`
          id,
          admission_status,
          created_at,
          learning_mode,
          is_born_again,
          has_discovered_ministry,
          gender,
          age,
          address,
          educational_background,
          preferred_language,
          ministry_description,
          marital_status,
          profile:profiles(first_name, last_name, middle_name, email, phone)
        `)
        .in("admission_status", ["Pending", "PENDING"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApplications((data as any) || []);
    } catch (err) {
      console.error("Load applications error:", err);
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "ADMITTED", is_approved: true })
        .eq("id", studentId);

      if (error) throw error;
      toast.success("Student Admitted Successfully");
      await loadApplications();
      setSelectedApp(null);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve application";
      toast.error(msg);
    }
  };

  const handleReject = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "REJECTED", is_approved: false })
        .eq("id", studentId);

      if (error) throw error;
      toast.success("Application rejected");
      await loadApplications();
      setSelectedApp(null);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject application";
      toast.error(msg);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBulkApproving(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "ADMITTED", is_approved: true })
        .in("id", ids);

      if (error) throw error;
      toast.success(`${ids.length} student(s) admitted successfully`);
      setSelectedIds(new Set());
      await loadApplications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve students";
      toast.error(msg);
    } finally {
      setBulkApproving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    const filtered = filteredApplications;
    selectedIds.size === filtered.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(filtered.map((a) => a.id)));
  };

  const filteredApplications = applications.filter((app) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.profile.first_name.toLowerCase().includes(q) ||
      app.profile.last_name.toLowerCase().includes(q) ||
      app.profile.email.toLowerCase().includes(q)
    );
  });

  const getFullName = (app: Application) => {
    return [app.profile.first_name, app.profile.middle_name, app.profile.last_name].filter(Boolean).join(" ");
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Admission Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Review and process new applications</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-foreground">{applications.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/5">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Showing</p>
              <p className="text-2xl font-bold text-foreground">{filteredApplications.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="text-2xl font-bold text-foreground">{selectedIds.size}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <span className="text-sm font-medium text-foreground mr-1">{selectedIds.size} selected</span>
          <Button
            size="sm"
            onClick={handleBulkApprove}
            disabled={bulkApproving}
            className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700"
          >
            {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {bulkApproving ? "Approving..." : "Approve All Selected"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="text-xs h-8 ml-auto text-muted-foreground">
            Clear
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Applications list */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pending Applications ({filteredApplications.length})</CardTitle>
          {filteredApplications.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={filteredApplications.length > 0 && selectedIds.size === filteredApplications.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredApplications.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No pending applications</p>
              <p className="text-sm text-muted-foreground mt-1">New registrations will appear here automatically</p>
            </div>
          ) : (
            filteredApplications.map((app) => (
              <div
                key={app.id}
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
                  selectedIds.has(app.id) ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <Checkbox
                    checked={selectedIds.has(app.id)}
                    onCheckedChange={() => toggleSelect(app.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{getFullName(app)}</h3>
                    <p className="text-sm text-muted-foreground">{app.profile.email}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                        <Clock className="w-3 h-3 mr-1" /> Pending
                      </Badge>
                      {app.learning_mode && (
                        <Badge variant="outline" className="text-xs">{app.learning_mode}</Badge>
                      )}
                      {app.is_born_again && (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">Born Again</Badge>
                      )}
                      {app.created_at && (
                        <span className="text-[11px] text-muted-foreground self-center">{timeAgo(app.created_at)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setSelectedApp(app)} className="gap-1">
                    <Eye className="w-4 h-4" /> View
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-primary-foreground"
                    onClick={() => handleApprove(app.id)}
                  >
                    <Check className="w-4 h-4" /> Admit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleReject(app.id)}
                  >
                    <X className="w-4 h-4" /> Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>Review the full application information</DialogDescription>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoField label="Full Name" value={getFullName(selectedApp)} />
                <InfoField label="Email" value={selectedApp.profile.email} />
                <InfoField label="Phone" value={selectedApp.profile.phone} />
                <InfoField label="Gender" value={selectedApp.gender} />
                <InfoField label="Age" value={selectedApp.age?.toString()} />
                <InfoField label="Marital Status" value={selectedApp.marital_status} />
                <InfoField label="Learning Mode" value={selectedApp.learning_mode} />
                <InfoField label="Language" value={selectedApp.preferred_language} />
                <InfoField label="Born Again" value={selectedApp.is_born_again ? "Yes" : "No"} />
                <InfoField label="Discovered Ministry" value={selectedApp.has_discovered_ministry ? "Yes" : "No"} />
              </div>
              {selectedApp.address && <InfoField label="Address" value={selectedApp.address} />}
              {selectedApp.educational_background && <InfoField label="Education" value={selectedApp.educational_background} />}
              {selectedApp.ministry_description && <InfoField label="Ministry Description" value={selectedApp.ministry_description} />}
              <div className="flex gap-2 pt-4 border-t border-border">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleApprove(selectedApp.id)}
                >
                  <Check className="w-4 h-4 mr-2" /> Admit Student
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleReject(selectedApp.id)}
                >
                  <X className="w-4 h-4 mr-2" /> Reject Application
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const InfoField = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    <p className="text-sm text-foreground">{value || "N/A"}</p>
  </div>
);

export default AdminAdmissions;
