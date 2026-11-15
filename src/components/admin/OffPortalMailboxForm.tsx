/**
 * A mailbox for someone with no portal account.
 *
 * The student record and the people list both start from a profile, which
 * covers students and staff and nobody else. A school also needs addresses for
 * people who will never sign in to the portal: a visiting lecturer, a board
 * member, a bursar who only ever uses email, a role somebody answers.
 *
 * The alternative would be creating empty portal accounts for them, which puts
 * people who cannot log in into every student list, count and mail-merge in the
 * app. So the mailbox names its holder directly instead, and this form is where
 * that name is given.
 *
 * Contact details are optional on purpose. Somebody being handed an address in
 * person needs no email or WhatsApp, and demanding one would mean inventing a
 * fake address to get past the form. Where they are given, the credentials go
 * out exactly as they do for a student; where they are not, the admin passes
 * the password on from the panel that appears once.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AtSign, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel } from "@/components/redesign/admin/primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IssuedCredentials, type Issued } from "@/components/admin/IssuedCredentials";

export const OffPortalMailboxForm = ({ onCreated }: { onCreated?: () => void }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [localPart, setLocalPart] = useState("");
  /** True once the admin edits the address, so the suggestion stops overwriting it. */
  const [addressTouched, setAddressTouched] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  /** Set when the chosen address was previously somebody else's. */
  const [reuseWarning, setReuseWarning] = useState<string | null>(null);

  /**
   * The address this name would get, asked of the server rather than worked out
   * here: it applies the same convention as every other mailbox and checks the
   * same clash list, including addresses belonging to deleted mailboxes.
   */
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || addressTouched) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase.functions.invoke("mailbox-admin", {
          body: { action: "suggest", holder_name: trimmed },
        });
        if (error || data?.error) {
          console.error("Mailbox suggestion failed:", data?.error ?? error);
          return;
        }
        if (!cancelled && data?.suggestion) setLocalPart(data.suggestion);
      })();
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [name, addressTouched]);

  const create = async (allowReuse = false) => {
    setBusy(true);
    const body = {
      action: "create",
      holder_name: name.trim(),
      holder_email: email.trim() || null,
      holder_phone: phone.trim() || null,
      local_part: localPart.trim(),
      notify,
      ...(allowReuse ? { allow_reuse: true } : {}),
    };
    const { data, error } = await supabase.functions.invoke("mailbox-admin", { body });
    setBusy(false);

    // A non-2xx from an edge function arrives as an error whose body holds the
    // sentence the function wrote. Without reading it the admin gets "Edge
    // Function returned a non-2xx status code", which tells them nothing.
    let payload: { error?: string; code?: string } | null = data ?? null;
    if (error) {
      try {
        payload = await (error as { context?: Response }).context?.json() ?? null;
      } catch { /* leave it null and fall back to a generic message */ }
    }

    // Previously somebody else's address: a decision for the admin, not a
    // failure, so it is put to them with the name of who held it.
    if (payload?.code === "address_previously_used") {
      setReuseWarning(String(payload.error ?? ""));
      return;
    }
    if (error || payload?.error) {
      toast.error(String(payload?.error ?? "Something went wrong"));
      return;
    }

    if (data?.address && data?.password) {
      setIssued({ address: data.address, password: data.password, delivery: data.delivery ?? null });
    }
    const sent = [data?.delivery?.emailed && "emailed", data?.delivery?.whatsapp && "sent on WhatsApp"]
      .filter(Boolean).join(" and ");
    toast.success(sent ? `Mailbox created and ${sent}.` : "Mailbox created. Copy the password below.");

    setName(""); setEmail(""); setPhone(""); setLocalPart(""); setAddressTouched(false);
    onCreated?.();
  };

  const canCreate = name.trim().length >= 2 && localPart.trim().length >= 2 && !busy;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Someone not on the portal
        </span>
      }
      titleId="off-portal-mailbox"
      description="A visiting lecturer, a board member, or any address the school needs that is not a student or staff login."
    >
      <div className="space-y-4 px-5 py-4">
        {issued && (
          <IssuedCredentials
            issued={issued}
            personName="them"
            onDismiss={() => setIssued(null)}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="offportal-name" className="text-[13px]">Full name</Label>
            <Input
              id="offportal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Grace Adeyemi"
              autoComplete="off"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="offportal-address" className="text-[13px]">Address</Label>
            <div className="mt-1 flex items-center gap-1.5">
              <Input
                id="offportal-address"
                value={localPart}
                onChange={(e) => { setLocalPart(e.target.value.toLowerCase()); setAddressTouched(true); }}
                placeholder="firstname.lastname"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
                @spiritlifesom.org
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="offportal-email" className="text-[13px]">
              Personal email <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="offportal-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="grace@example.com"
              autoComplete="off"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="offportal-phone" className="text-[13px]">
              WhatsApp number <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="offportal-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0803 123 4567"
              autoComplete="off"
              className="mt-1"
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-[13px]">
          <Checkbox
            checked={notify}
            onCheckedChange={(v) => setNotify(v === true)}
            className="mt-0.5"
            aria-label="Send the details to this person"
          />
          <span>
            Send the address and password to whichever of the two above are filled in.
            {" "}
            <span className="text-muted-foreground">
              Leave both blank and nothing is sent — you pass the password on yourself from the
              panel that appears once.
            </span>
          </span>
        </label>

        <div className="flex justify-end">
          <Button onClick={() => create()} disabled={!canCreate}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <AtSign className="mr-1.5 h-4 w-4" />}
            Create mailbox
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(reuseWarning)}
        onOpenChange={(open) => !open && setReuseWarning(null)}
        title="Give out an address someone else had?"
        variant="destructive"
        description={
          <>
            <p>{reuseWarning}</p>
            <p>
              Mail is still sent to old addresses for years. Anything that arrives from now on
              will be read by whoever you are giving it to.
            </p>
          </>
        }
        confirmLabel="Reuse the address"
        loading={busy}
        onConfirm={() => { setReuseWarning(null); void create(true); }}
      />
    </Panel>
  );
};

export default OffPortalMailboxForm;
