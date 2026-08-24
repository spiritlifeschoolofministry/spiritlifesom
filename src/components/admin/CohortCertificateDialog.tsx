import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CertificateArtwork } from "@/components/certificate/CertificateArtwork";
import { CertificateFrame } from "@/components/certificate/CertificateFrame";
import { SignaturePad } from "@/components/certificate/SignaturePad";
import { MAX_SIGNATURE_BYTES, dataUrlBytes } from "@/lib/signature-image";
import type { CertificateSignatory } from "@/lib/certificate-design";
import {
  parseSignatories,
  serialiseSignatories,
  withEmptySlots,
} from "@/lib/certificate-signatories";
import { CERTIFICATE_VERIFY_HOST } from "@/lib/certificate-serial";

export type EditableCohort = {
  id: string;
  name: string;
  graduation_date: string | null;
  certificate_text_main: string | null;
  certificate_text_sub: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

const DEFAULT_MAIN_TEXT =
  "has successfully completed a year of intensive training and teaching in the School of Ministry";

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "Graduation date not set";

/**
 * Edits everything that is per-cohort about a certificate, beside a live preview
 * of the certificate those settings produce. The preview is the same component
 * the student downloads, so what an admin approves here is what gets issued.
 */
export const CohortCertificateDialog = ({
  cohort,
  open,
  onOpenChange,
  onSaved,
}: {
  cohort: EditableCohort | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [graduationDate, setGraduationDate] = useState("");
  const [mainText, setMainText] = useState("");
  const [subText, setSubText] = useState("");
  const [signatories, setSignatories] = useState<CertificateSignatory[]>([]);

  useEffect(() => {
    if (!cohort || !open) return;

    setLoading(true);
    setGraduationDate(cohort.graduation_date ?? "");
    setMainText(cohort.certificate_text_main ?? "");
    setSubText(cohort.certificate_text_sub ?? "");

    supabase
      .from("cohort_certificate_settings")
      .select("signatories")
      .eq("cohort_id", cohort.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Error loading cohort signatories:", error);
          toast.error("Could not load this cohort's signatories");
        }
        setSignatories(withEmptySlots(parseSignatories(data?.signatories)));
        setLoading(false);
      });
  }, [cohort, open]);

  // Every cohort once carried the same 2025-04-20, copied from an old default --
  // one of them a month before that session even began. A date outside the
  // session's own dates is nearly always that mistake repeating.
  const dateLooksWrong =
    graduationDate && cohort?.start_date && cohort?.end_date
      ? graduationDate < cohort.start_date || graduationDate > cohort.end_date
      : false;

  const updateSignatory = (index: number, patch: Partial<CertificateSignatory>) =>
    setSignatories((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );

  const save = async () => {
    if (!cohort) return;

    const oversized = signatories.find(
      (s) => s.signatureUrl && dataUrlBytes(s.signatureUrl) > MAX_SIGNATURE_BYTES,
    );
    if (oversized) {
      toast.error(`${oversized.name || "That"} signature is too large — redraw it or use a simpler scan`);
      return;
    }

    setSaving(true);
    try {
      const { error: cohortError } = await supabase
        .from("cohorts")
        .update({
          graduation_date: graduationDate || null,
          certificate_text_main: mainText.trim() || null,
          certificate_text_sub: subText.trim() || null,
        })
        .eq("id", cohort.id);
      if (cohortError) throw cohortError;

      // The row is seeded by a trigger when a cohort is created, but upsert so an
      // older cohort that predates the trigger still saves.
      const { error: settingsError } = await supabase
        .from("cohort_certificate_settings")
        .upsert(
          { cohort_id: cohort.id, signatories: serialiseSignatories(signatories) },
          { onConflict: "cohort_id" },
        );
      if (settingsError) throw settingsError;

      toast.success(`${cohort.name} certificate settings saved`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving cohort certificate settings:", err);
      toast.error("Failed to save certificate settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Certificate for {cohort?.name}</DialogTitle>
          <DialogDescription>
            These settings apply to every graduate of this cohort. Past cohorts keep their own, so
            changing them here does not alter certificates already issued for other sessions.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            {/* Settings */}
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="cert-grad-date">Graduation date</Label>
                <Input
                  id="cert-grad-date"
                  type="date"
                  value={graduationDate}
                  onChange={(e) => setGraduationDate(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Every graduate of this cohort is certified on this date.
                </p>
                {dateLooksWrong && (
                  <p className="text-[11px] font-medium text-amber-600">
                    That is outside this session ({cohort?.start_date} to {cohort?.end_date}). Saveable,
                    but check it is what you mean.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cert-main">Body text</Label>
                <Textarea
                  id="cert-main"
                  rows={3}
                  value={mainText}
                  onChange={(e) => setMainText(e.target.value)}
                  placeholder={DEFAULT_MAIN_TEXT}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cert-sub">Second line (optional)</Label>
                <Input
                  id="cert-sub"
                  value={subText}
                  onChange={(e) => setSubText(e.target.value)}
                  placeholder="Leave blank to omit"
                />
              </div>

              <div className="space-y-4 pt-2 border-t">
                <div>
                  <h4 className="text-sm font-semibold">Signatories</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Printed left to right. Clear both the name and title to leave a side blank.
                  </p>
                </div>

                {signatories.map((signatory, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                    <Input
                      value={signatory.name}
                      onChange={(e) => updateSignatory(index, { name: e.target.value })}
                      placeholder={index === 0 ? "Pastor Folakemi Obadare" : "Prophet Cherub Obadare"}
                      className="h-9"
                      aria-label={`Signatory ${index + 1} name`}
                    />
                    <Input
                      value={signatory.title}
                      onChange={(e) => updateSignatory(index, { title: e.target.value })}
                      placeholder={index === 0 ? "Residence Pastor" : "Founder/Proprietor"}
                      className="h-9"
                      aria-label={`Signatory ${index + 1} title`}
                    />
                    <SignaturePad
                      label="Signature"
                      value={signatory.signatureUrl ?? ""}
                      onChange={(dataUrl) => updateSignatory(index, { signatureUrl: dataUrl || null })}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Live preview */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Preview
              </p>
              <CertificateFrame className="rounded-lg border border-border shadow-sm">
                <CertificateArtwork
                  recipientName="Adebayo Oluwaseun Grace"
                  studentCode="SLSM/BBM/2025/001"
                  dateText={formatDate(graduationDate || null)}
                  mainText={mainText.trim() || DEFAULT_MAIN_TEXT}
                  subText={subText.trim() || null}
                  signatories={signatories}
                  serial="SLSM-4K7P-92XT"
                  verifyHost={CERTIFICATE_VERIFY_HOST}
                />
              </CertificateFrame>
              <p className="text-[11px] text-muted-foreground">
                Sample name, code and certificate number. Each graduate's own details are filled in
                when they download it.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
