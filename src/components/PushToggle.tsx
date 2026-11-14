import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { disablePush, enablePush, getPushState, pushStateHint, type PushState } from "@/lib/push";

/**
 * The switch for push notifications on this device. Used in the bell (both
 * portals) and on the student Profile page.
 */
const PushToggle = ({ className }: { className?: string }) => {
  const id = useId();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getPushState().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const next = await enablePush();
        setState(next);
        if (next === "on") toast.success("Notifications are on for this device");
      } else {
        await disablePush();
        setState("off");
        toast.success("Notifications are off for this device");
      }
    } catch (err) {
      console.error("Push toggle error:", err);
      toast.error(err instanceof Error ? err.message : "Could not change notifications");
      setState(await getPushState());
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;
  const hint = pushStateHint(state);
  const usable = state === "on" || state === "off";

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          Notify me on this device
        </label>
        <span className="flex items-center gap-2">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
          <Switch id={id} checked={state === "on"} disabled={!usable || busy} onCheckedChange={toggle} />
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {hint ?? "Get the notices in this list as phone or desktop notifications, even when the portal is closed."}
      </p>
    </div>
  );
};

export default PushToggle;
