import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const usePendingAdmissionsCount = (enabled: boolean = true) => {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const load = async () => {
      // Count pending admissions
      const [{ count: admissionsCount }, { count: requestsCount }] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).ilike("admission_status", "pending"),
        // Count students who have a pending learning mode request
        supabase.from("students").select("id", { count: "exact", head: true }).not("requested_learning_mode", "is", null),
      ]);
      const a = admissionsCount ?? 0;
      const r = requestsCount ?? 0;
      if (mounted) setCount(a + r);
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
