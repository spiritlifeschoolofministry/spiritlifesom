import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const usePendingAdmissionsCount = (enabled: boolean = true) => {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const load = async () => {
      // Count pending admissions, learning-mode requests, and certificate name-change requests
      const [
        { count: admissionsCount },
        { count: lmRequestsCount },
        { count: certRequestsCount },
      ] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_staff_preview", false).ilike("admission_status", "pending"),
        // Count students who have a pending learning mode request
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_staff_preview", false).not("requested_learning_mode", "is", null),
        // Count students who have a pending certificate name change
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_staff_preview", false).not("pending_name_change", "is", null),
      ]);
      const a = admissionsCount ?? 0;
      const l = lmRequestsCount ?? 0;
      const c = certRequestsCount ?? 0;
      if (mounted) setCount(a + l + c);
    };

    load();

    // Realtime updates when admission status changes
    const channel = supabase
      .channel("pending-admissions-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students" },
        () => load()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return count;
};
