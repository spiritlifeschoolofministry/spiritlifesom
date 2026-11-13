import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type FeeAction = "adjust" | "waive" | "unwaive";

export interface FeeActionTarget {
  id: string;
  student_name: string;
  fee_type: string;
  amount_due: number | null;
  amount_paid: number | null;
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/**
 * Adjust a student's fee (amount due) or waive it / undo the waiver. Both go
 * through admin-only database functions (admin_set_fee_due,
 * admin_set_fee_waived) that recompute the status and refuse an amount due
 * below what has been paid; the audit trigger on fees records the change.
 */
const FeeActionDialog = ({
  action,
  target,
  onClose,
  onDone,
}: {
  action: FeeAction | null;
  target: FeeActionTarget | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const open = Boolean(action && target);
  const paid = Number(target?.amount_paid ?? 0);

  useEffect(() => {
    if (open) {
      setAmount(String(target?.amount_due ?? ""));
      setReason("");
    }
  }, [open, target]);

  const submit = async () => {
    if (!target || !action) return;
    setSaving(true);
    try {
      if (action === "adjust") {
        const value = Number(amount);
        if (!Number.isFinite(value) || value < 0) { toast.error("Enter an amount of zero or more"); return; }
        if (value < paid) { toast.error(`It already has ${naira(paid)} paid; the amount due cannot be less.`); return; }
        const { error } = await supabase.rpc("admin_set_fee_due", { p_fee_id: target.id, p_amount_due: value });
        if (error) throw error;
        toast.success(`${target.fee_type} for ${target.student_name} is now ${naira(value)}`);
      } else {
        if (action === "waive" && !reason.trim()) { toast.error("Give a reason for waiving this fee"); return; }
        const { error } = await supabase.rpc("admin_set_fee_waived", {
          p_fee_id: target.id,
          p_waived: action === "waive",
          p_reason: action === "waive" ? reason.trim() : null,
        });
        if (error) throw error;
        toast.success(action === "waive" ? `${target.fee_type} waived for ${target.student_name}` : "Waiver removed");
      }
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the change");
    } finally {
      setSaving(false);
    }
  };

  const title = action === "adjust" ? "Adjust fee" : action === "waive" ? "Waive fee" : "Undo waiver";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {target ? `${target.fee_type} · ${target.student_name} · ${naira(Number(target.amount_due ?? 0))} due, ${naira(paid)} paid` : ""}
          </DialogDescription>
        </DialogHeader>
        {action === "adjust" && (
          <div className="space-y-2">
            <Label htmlFor="fee-amount-due">New amount due (₦)</Label>
            <Input id="fee-amount-due" inputMode="decimal" type="number" min={paid} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" />
            <p className="text-xs text-muted-foreground">Can't be less than what has been paid ({naira(paid)}). The status updates itself.</p>
          </div>
        )}
        {action === "waive" && (
          <div className="space-y-2">
            <Label htmlFor="fee-waive-reason">Reason</Label>
            <Textarea id="fee-waive-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this student does not pay this fee" />
            <p className="text-xs text-muted-foreground">Waived fees no longer count as owed anywhere in the portal.</p>
          </div>
        )}
        {action === "unwaive" && <p className="text-sm text-muted-foreground">The fee will count as owed again, with what has been paid kept.</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="h-11">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="h-11">{saving ? "Saving…" : title}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeeActionDialog;
