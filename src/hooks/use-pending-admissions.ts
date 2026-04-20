import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const usePendingAdmissionsCount = (enabled: boolean = true) => {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const load = async () => {
      const { count: c } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .ilike("admission_status", "pending");
      if (mounted) setCount(c ?? 0);
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
