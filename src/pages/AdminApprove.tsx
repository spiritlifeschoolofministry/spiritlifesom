import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const AdminApprove = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const approve = async () => {
      setLoading(true);
      try {
        const { error: rpcError } = await supabase.rpc("approve_student_by_token", { token });
        if (rpcError) throw rpcError;
        setSuccess("Student has been approved successfully. They will now have full access to the portal.");
      } catch (err: any) {
        setError(err?.message || "Failed to approve student");
      } finally {
        setLoading(false);
      }
    };

    if (!token) {
      setError("Missing approval token");
      setLoading(false);
      return;
    }

    approve();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader>
            <CardTitle className="text-base">Admission Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing approval...</span>
              </div>
            )}

            {!loading && success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md p-4">
                {success}
              </div>
            )}

            {!loading && error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md p-4">
                {error}
              </div>
            )}

            <div className="pt-2">
              <Link to="/admin/dashboard">
                <Button variant="outline">Back to Admin Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminApprove;
