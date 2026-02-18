import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Application {
  id: string;
  admission_status: string | null;
  created_at: string | null;
  learning_mode: string | null;
  is_born_again: boolean | null;
  has_discovered_ministry: boolean | null;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
}

const AdminAdmissions = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

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
          profile:profiles(first_name, last_name, email, phone)
        `)
        .eq("admission_status", "Pending")
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
        .update({ admission_status: "Approved" })
        .eq("id", studentId);

      if (error) throw error;

      setApplications((prev) => prev.filter((a) => a.id !== studentId));
      toast.success("Application approved");
      setSelectedApp(null);
    } catch (err) {
      console.error("Approve error:", err);
      toast.error("Failed to approve application");
    }
  };

  const handleReject = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from("students")
        .update({ admission_status: "Rejected" })
        .eq("id", studentId);

      if (error) throw error;

      setApplications((prev) => prev.filter((a) => a.id !== studentId));
      toast.success("Application rejected");
      setSelectedApp(null);
    } catch (err) {
      console.error("Reject error:", err);
      toast.error("Failed to reject application");
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
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Admission Management</h1>
        <p className="text-muted-foreground text-sm mt-1">Review and process new applications</p>
      </div>

      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader>
          <CardTitle className="text-base">Pending Applications ({applications.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No pending applications
            </p>
          ) : (
            applications.map((app) => (
              <div
                key={app.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">
                    {app.profile.first_name} {app.profile.last_name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{app.profile.email}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {app.learning_mode || "N/A"}
                    </Badge>
                    {app.is_born_again && (
                      <Badge variant="outline" className="text-xs">
                        Born Again
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedApp(app)}
                  >
                    <Eye className="w-4 h-4 mr-1" /> View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-emerald-600 hover:text-emerald-700"
                    onClick={() => handleApprove(app.id)}
                  >
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleReject(app.id)}
                  >
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>
              Review the full application information
            </DialogDescription>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Name</h4>
                <p className="text-foreground">
                  {selectedApp.profile.first_name} {selectedApp.profile.last_name}
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Email</h4>
                <p className="text-foreground">{selectedApp.profile.email}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Phone</h4>
                <p className="text-foreground">{selectedApp.profile.phone || "N/A"}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Learning Mode</h4>
                <p className="text-foreground">{selectedApp.learning_mode || "N/A"}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Born Again</h4>
                <p className="text-foreground">{selectedApp.is_born_again ? "Yes" : "No"}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Discovered Ministry</h4>
                <p className="text-foreground">{selectedApp.has_discovered_ministry ? "Yes" : "No"}</p>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleApprove(selectedApp.id)}
                >
                  <Check className="w-4 h-4 mr-2" /> Approve Application
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

export default AdminAdmissions;
