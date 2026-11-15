/**
 * A person's own @spiritlifesom.org address, on their own profile.
 *
 * Shared by the student portal and the staff profile, because the question is
 * the same either way: what is my address, and how do I actually read it.
 * Staff especially have nowhere else -- they have no student record, so
 * without this an administrator has no screen showing their own mailbox.
 *
 * Read-only by design. Nobody can create, rename or delete their own school
 * mailbox; an official address is issued by the school.
 *
 * It renders nothing at all when there is no mailbox. Most people will not
 * have one yet, and an empty card headed "School mailbox" invites a support
 * message asking why it is empty.
 *
 * The RLS policy `mailboxes_select_own` is what makes this safe to query from
 * the browser: a person sees their row and no one else's, and the table holds
 * no password to leak in the first place.
 */
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MailSetupGuide } from "@/components/MailSetupGuide";

const MAIL_HOST = "mail.spiritlifesom.org";

export const SchoolMailbox = ({ userId }: { userId: string }) => {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("mailboxes")
        .select("address, status")
        .eq("profile_id", userId)
        .eq("status", "active")
        .maybeSingle();
      // A student with no mailbox is the normal case, not a fault: log a real
      // error, but never put a toast in front of them for it.
      if (error) console.error("Load school mailbox error:", error);
      if (!cancelled) setAddress(data?.address ?? null);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!address) return null;


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5" /> School mailbox
        </CardTitle>
        <CardDescription>Your official Spirit Life address.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MailSetupGuide address={address} />

        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">To change your password,</strong> sign in at{" "}
          <a className="underline" href={`https://${MAIL_HOST}`} target="_blank" rel="noreferrer">
            {MAIL_HOST}
          </a>
          . That page is for settings only and does not show your messages. If you have forgotten
          the password, ask the school office to reset it — nobody can look it up for you.
        </p>
      </CardContent>
    </Card>
  );
};

export default SchoolMailbox;
