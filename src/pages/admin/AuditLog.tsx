import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csv-export";

interface AuditRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  old_values: unknown;
  new_values: unknown;
  metadata: unknown;
}

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "student.status_change", label: "Student status change" },
  { value: "student.cohort_change", label: "Student cohort change" },
  { value: "student.code_change", label: "Student code change" },
  { value: "student.deleted", label: "Student deleted" },
  { value: "payment.verified", label: "Payment verified" },
  { value: "payment.rejected", label: "Payment rejected" },
  { value: "payment.deleted", label: "Payment deleted" },
  { value: "fee.adjusted", label: "Fee adjusted" },
  { value: "fee.deleted", label: "Fee deleted" },
  { value: "announcement.deleted", label: "Announcement deleted" },
  { value: "profile.role_change", label: "Role change" },
];

const variantFor = (action: string): "default" | "destructive" | "secondary" | "outline" => {
  if (action.includes("deleted") || action.includes("rejected")) return "destructive";
  if (action.includes("verified") || action.includes("status_change")) return "default";
  return "secondary";
};

const AdminAuditLog = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Cast since audit_logs is brand-new and not yet in generated types.
        const client = supabase as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: AuditRow[] | null; error: unknown }>;
              };
            };
          };
        };
        const { data, error } = await client
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        setRows(data || []);
      } catch (err) {
        console.error("Audit log load failed", err);
        toast.error("Failed to load audit log");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (actionFilter !== "all" && r.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (r.summary || "").toLowerCase().includes(q) ||
        (r.actor_email || "").toLowerCase().includes(q) ||
        (r.action || "").toLowerCase().includes(q) ||
        (r.entity_id || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = () => {
    if (!filtered.length) {
      toast.error("No entries to export");
      return;
    }
    const rowsForCsv = filtered.map((r) => ({
      timestamp: new Date(r.created_at).toISOString(),
      action: r.action,
      summary: r.summary || "",
      entity_type: r.entity_type,
      entity_id: r.entity_id || "",
      admin_email: r.actor_email || "System",
      admin_role: r.actor_role || "",
      old_values: r.old_values ? JSON.stringify(r.old_values) : "",
      new_values: r.new_values ? JSON.stringify(r.new_values) : "",
      metadata: r.metadata ? JSON.stringify(r.metadata) : "",
    }));
    downloadCSV(rowsForCsv, "audit_log");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" /> Audit Log
          </h1>
          <p className="text-muted-foreground">
            Append-only record of every admin status change, payment verification, and deletion.
          </p>
        </div>
        <Button
          onClick={handleExport}
          disabled={loading || filtered.length === 0}
          className="gap-2 self-start md:self-auto"
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            {loading ? "Loading..." : `${filtered.length} of ${rows.length} entries`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Search summary, admin email, action, entity id..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No audit entries found</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={variantFor(r.action)} className="font-mono text-xs">
                          {r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="text-sm">{r.summary || "—"}</p>
                        {r.entity_id && (
                          <p className="text-[10px] text-muted-foreground font-mono mt-1">
                            {r.entity_type}:{r.entity_id.slice(0, 8)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p className="font-medium">{r.actor_email || "System"}</p>
                          {r.actor_role && (
                            <p className="text-muted-foreground">{r.actor_role}</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuditLog;
