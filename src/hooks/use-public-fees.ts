import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { summarisePublicFees, type PublicFeeRow, type PublicFeeSummary } from "@/lib/public-fees";

/**
 * The fees line for public pages. `note` is site_content home/fees_note (pass
 * what useSiteContent returns); when it is empty the live price list from
 * public_fee_summary() is used. A failed fetch just shows nothing.
 */
export function usePublicFees(note: string | null | undefined): PublicFeeSummary {
  const [rows, setRows] = useState<PublicFeeRow[] | null>(null);
  const hasNote = (note ?? "").trim().length > 0;

  useEffect(() => {
    if (hasNote) return;
    let cancelled = false;
    supabase.rpc("public_fee_summary").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("[usePublicFees]", error.message);
        setRows([]);
        return;
      }
      setRows((data as PublicFeeRow[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [hasNote]);

  return summarisePublicFees(rows, note);
}
