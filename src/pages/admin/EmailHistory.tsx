import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Mail, Search, RefreshCw, CheckCircle2, XCircle, Bot, User as UserIcon } from "lucide-react";

interface EmailRow {
  id: string;
  recipient_email: string;
  email_type: string;
  trigger_source: string;
  triggered_by_email: string | null;
  status: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  welcome: "Welcome",
  admission_approved: "Admission Approved",
  admission_rejected: "Admission Rejected",
};

const EmailHistory = () => {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_send_history")
      .select("id, recipient_email, email_type, trigger_source, triggered_by_email, status, attempts, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error) setRows((data as EmailRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (typeFilter !== "all" && r.email_type !== typeFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (sourceFilter !== "all" && r.trigger_source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.recipient_email.toLowerCase().includes(q) &&
          !(r.triggered_by_email || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: rows.length,
    sent: rows.filter(r => r.status === "sent").length,
    failed: rows.filter(r => r.status === "failed").length,
    manual: rows.filter(r => r.trigger_source === "manual").length,
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString();

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary" /> Email History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">All emails sent by the platform — manual and automatic</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Sent", value: stats.sent, color: "text-emerald-600" },
          { label: "Failed", value: stats.failed, color: "text-destructive" },
          { label: "Manual", value: stats.manual, color: "text-primary" },
        ].map((s) => (
          <Card key={s.label} className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search recipient or sender…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="welcome">Welcome</SelectItem>
              <SelectItem value="admission_approved">Admission Approved</SelectItem>
              <SelectItem value="admission_rejected">Admission Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="automatic">Automatic</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-[var(--shadow-card)] border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Showing {filtered.length} of {rows.length} entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No emails match the current filters.</div>
          ) : (
            filtered.map((r) => (
              <div
                key={r.id}
                className={`p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors ${
                  r.status === "failed" ? "border-destructive/30" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.status === "sent" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      <span className="font-medium text-foreground truncate">{r.recipient_email}</span>
                      <Badge variant="outline" className="text-xs">{TYPE_LABELS[r.email_type] || r.email_type}</Badge>
                      <Badge variant="outline" className="text-xs gap-1">
                        {r.trigger_source === "manual" ? <UserIcon className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                        {r.trigger_source}
                      </Badge>
                      {r.attempts > 1 && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                          {r.attempts} attempts
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span>{fmtDate(r.created_at)}</span>
                      {r.triggered_by_email && <span>by {r.triggered_by_email}</span>}
                    </div>
                    {r.error_message && (
                      <p className="text-xs text-destructive mt-1.5 break-words">⚠ {r.error_message}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailHistory;
