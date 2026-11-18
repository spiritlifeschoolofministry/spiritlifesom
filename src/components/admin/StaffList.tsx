import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface StaffProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string | null;
}

interface Props {
  searchQuery: string;
  /** profile id -> student id, for staff who are also enrolled. */
  studentIdByProfile: Map<string, string>;
}

/**
 * Staff on the Students page.
 *
 * Staff have no `students` row, so the student table (status, cohort, graduate,
 * move) has nothing to say about them. This is a plain read-only list of every
 * profile whose role is not "student" -- the same definition of staff the
 * Mailboxes page uses. Someone who is also enrolled links to their student
 * record; changing a role stays where it already lives.
 */
export const StaffList = ({ searchQuery, studentIdByProfile }: Props) => {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, role, created_at")
        .neq("role", "student")
        .order("first_name");
      if (cancelled) return;
      if (error) {
        console.error("Load staff error:", error);
        setFailed(true);
      } else {
        setStaff((data as StaffProfile[]) || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((p) =>
      [p.first_name, p.last_name, p.email].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [staff, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Showing {shown.length} of {staff.length} staff
      </p>
      {failed || shown.length === 0 ? (
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium">{failed ? "Could not load staff" : "No staff found"}</p>
            {!failed && <p className="text-xs mt-1">Try adjusting your search</p>}
          </CardContent>
        </Card>
      ) : (
        shown.map((p) => {
          const studentId = studentIdByProfile.get(p.id);
          const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(no name)";
          const initials = `${p.first_name?.[0] ?? ""}${p.last_name?.[0] ?? ""}`;
          return (
            <Card
              key={p.id}
              className={`shadow-[var(--shadow-card)] border-border ${studentId ? "cursor-pointer hover:bg-muted/50" : ""}`}
              onClick={studentId ? () => navigate(`/admin/students/${studentId}`) : undefined}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.email ?? "—"}</p>
                </div>
                <Badge variant="outline" className="capitalize shrink-0">{p.role ?? "unknown"}</Badge>
                {studentId && (
                  <Badge variant="secondary" className="shrink-0 hidden sm:inline-flex">Also a student</Badge>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};
