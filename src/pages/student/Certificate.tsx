import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Edit2, Check, RotateCcw, FileDown, Image as ImageIcon, Printer, Loader2, ShieldCheck } from "lucide-react";
import { EmptyCard, Panel, Pill, ScreenHeader } from "@/components/redesign/student-pages/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CertificateArtwork } from "@/components/certificate/CertificateArtwork";
import {
  loadCertificateFonts,
  type CertificateSignatory,
} from "@/lib/certificate-design";
import { DEFAULT_SIGNATORIES, parseSignatories } from "@/lib/certificate-signatories";
import { CERTIFICATE_VERIFY_HOST, certificateVerifyUrl } from "@/lib/certificate-serial";
import { CertificateFrame } from "@/components/certificate/CertificateFrame";
import LazyCertificate3D from "@/components/three/LazyCertificate3D";
import { certificateFilename, exportCertificate } from "@/lib/certificate-export";

const StudentCertificate = () => {
  const { student, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customName, setCustomName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [cohortData, setCohortData] = useState<{ name: string; graduation_date?: string; certificate_text_main?: string; certificate_text_sub?: string } | null>(null);

  const isGraduate = (student?.admission_status || "").toUpperCase() === "GRADUATE";
  const [globalDate, setGlobalDate] = useState("20th April, 2025");
  const [isPendingVerification, setIsPendingVerification] = useState(false);
  const [originalFullName, setOriginalFullName] = useState("");
  const [signatories, setSignatories] = useState<CertificateSignatory[]>(DEFAULT_SIGNATORIES);
  const [serial, setSerial] = useState<string | null>(null);

  useEffect(() => {
    const loadCertConfig = async () => {
      // Load global date
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'global_graduation_date')
        .maybeSingle();
      
      if (settingsData?.value) {
        try {
          setGlobalDate(JSON.parse(settingsData.value as string));
        } catch {
          setGlobalDate(settingsData.value as string);
        }
      }

      if (student) {
        if (student.name_on_certificate) {
          setCustomName(student.name_on_certificate);
        }
        if (student.pending_name_change) {
          setIsPendingVerification(true);
        }
      }
    };

    if (student?.cohort_id) {
      supabase.from("cohorts").select("name, graduation_date, certificate_text_main, certificate_text_sub").eq("id", student.cohort_id).single().then(({ data }) => {
        if (data) setCohortData(data);
      });

      // Who signs this cohort's certificates. A cohort with no row falls back to
      // the pair that was hardcoded before this was configurable.
      supabase
        .from("cohort_certificate_settings")
        .select("signatories")
        .eq("cohort_id", student.cohort_id)
        .maybeSingle()
        .then(({ data }) => setSignatories(parseSignatories(data?.signatories)));
    }

    if (student?.id) {
      // Issued at graduation by a trigger, so this exists for any graduate.
      supabase
        .from("certificates")
        .select("serial")
        .eq("student_id", student.id)
        .maybeSingle()
        .then(({ data }) => setSerial(data?.serial ?? null));
    }
    
    void loadCertificateFonts();
    loadCertConfig();
    setLoading(false);
  }, [student]);

  const requestNameChange = async () => {
    if (!student || !customName.trim() || customName === originalFullName) return;
    
    try {
      const { error } = await supabase
        .from('students')
        .update({ pending_name_change: customName.trim() })
        .eq('id', student.id);
      
      if (error) throw error;
      
      setIsPendingVerification(true);
      setIsEditingName(false);
      toast.success("Name change request submitted for admin verification");
    } catch (err) {
      console.error("Error requesting name change:", err);
      toast.error("Failed to submit name change request");
    }
  };

  const certificateRef = useRef<HTMLDivElement>(null);

  // Anything that needs a name on the certificate first needs a name.
  const requireName = () => {
    if (customName.trim()) return true;
    toast.error("Please enter a name for the certificate");
    setIsEditingName(true);
    return false;
  };

  const handlePrint = () => {
    if (!requireName()) return;
    window.print();
  };

  const handleDownload = async (format: "pdf" | "png") => {
    if (!requireName()) return;
    if (!certificateRef.current) return;

    setIsDownloading(true);
    const ok = await exportCertificate(
      certificateRef.current,
      certificateFilename(customName),
      format,
    );
    setIsDownloading(false);

    if (ok) toast.success(`Certificate downloaded as ${format.toUpperCase()}`);
    else toast.error(`Failed to generate ${format.toUpperCase()}`);
  };

  const handleResetName = () => {
    const name = `${profile?.first_name || ""} ${profile?.middle_name || ""} ${profile?.last_name || ""}`.replace(/\s+/g, " ").trim();
    setCustomName(name);
    toast.info("Name reset to profile default");
  };

  useEffect(() => {
    if (profile) {
      const name = `${profile?.first_name || ""} ${profile?.middle_name || ""} ${profile?.last_name || ""}`.replace(/\s+/g, " ").trim();
      setOriginalFullName(name);
      if (!student?.name_on_certificate) {
        setCustomName(name);
      }
    }
  }, [profile, student]);

  const fullName = customName;

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // A cohort graduates on one day, so the date is the cohort's -- not the
  // student's. students.graduation_date used to win here, which let one graduate
  // silently carry a different date from the people they graduated beside.
  const graduationDateText = cohortData?.graduation_date
    ? formatDate(cohortData.graduation_date)
    : globalDate;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-[500px] rounded-[20px]" />
      </div>
    );
  }

  if (!isGraduate) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <ScreenHeader title="Certificate" />
        <EmptyCard icon={<Lock className="h-6 w-6" aria-hidden="true" />} title="Certificate not available yet">
          Your certificate of completion will be available here once you have graduated from the program. Keep up the great work!
        </EmptyCard>
      </div>
    );
  }

  const actionButton =
    "h-11 gap-2 rounded-xl px-4 font-semibold";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ScreenHeader
        title="Certificate of completion"
        description="Download, print and share your graduation certificate."
        className="print:hidden"
      />

      {/* The celebratory moment: the card turns over from its seal to its
          face. Decorative only; skipped without WebGL and in print. */}
      <div className="mx-auto max-w-xl print:hidden">
        <LazyCertificate3D
          details={{ name: customName || fullName, cohort: cohortData?.name, serial, dateText: graduationDateText }}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 print:hidden">
        {/* Name on certificate */}
        <Panel className="space-y-3" aria-labelledby="cert-name">
          <div className="flex items-center justify-between gap-2">
            <h2 id="cert-name" className="text-base font-bold">Name on certificate</h2>
            {isPendingVerification
              ? <Pill tone="info">Awaiting review</Pill>
              : <Pill tone="success"><Check className="h-3 w-3" aria-hidden="true" /> In use</Pill>}
          </div>
          {isEditingName ? (
            <div className="space-y-2">
              <label htmlFor="cert-name-input" className="sr-only">Name on certificate</label>
              <Input
                id="cert-name-input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Enter your full name"
                className="h-11 rounded-xl text-base"
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleResetName} className={actionButton} title="Reset to profile name">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset to profile name
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className={actionButton} disabled={!customName.trim() || customName === originalFullName}>
                      <Check className="h-4 w-4" aria-hidden="true" /> Request correction
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Request Name Change?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your request to change the name on your certificate to <strong>"{customName}"</strong> will be sent to the administration for verification.
                        You won't be able to edit it again until it's reviewed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={requestNameChange}>Confirm Request</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-[15px] font-semibold">
                {isPendingVerification ? (
                  <span className="italic text-muted-foreground">
                    {student?.pending_name_change} (pending verification)
                  </span>
                ) : (
                  customName || "Enter name"
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => setIsEditingName(true)}
                className={actionButton}
                disabled={isPendingVerification}
              >
                <Edit2 className="h-4 w-4" aria-hidden="true" /> {isPendingVerification ? "Awaiting review" : "Request a correction"}
              </Button>
            </div>
          )}
          {isPendingVerification && (
            <p className="text-xs font-medium text-[#8A3F05] dark:text-amber-300">
              An administrator must verify your name change before it appears on the certificate.
            </p>
          )}
        </Panel>

        {/* Save and print */}
        <Panel className="space-y-3" aria-labelledby="cert-save">
          <h2 id="cert-save" className="text-base font-bold">Save or print</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDownload("pdf")}
              disabled={isDownloading}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#E0A526] px-4 text-sm font-bold text-[#17112B] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
              Save PDF
            </button>
            <Button variant="outline" onClick={() => handleDownload("png")} className={actionButton} disabled={isDownloading}>
              <ImageIcon className="h-4 w-4" aria-hidden="true" /> Save PNG
            </Button>
            <Button variant="outline" onClick={handlePrint} className={actionButton}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Print
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Saved and printed copies come out at full A4 landscape size regardless of the screen you are on.
          </p>
        </Panel>
      </div>

      {/* Drawn at A4 print size and scaled down to fit -- see CertificateFrame */}
      <div className="print:m-0 certificate-container overflow-hidden">
        <CertificateFrame ref={certificateRef} className="mx-auto max-w-5xl shadow-2xl print:shadow-none">
          <CertificateArtwork
            recipientName={customName || fullName}
            studentCode={student?.student_code}
            dateText={graduationDateText}
            mainText={
              cohortData?.certificate_text_main ||
              "has successfully completed a year of intensive training and teaching in the School of Ministry"
            }
            subText={cohortData?.certificate_text_sub}
            signatories={signatories}
            serial={serial}
            verifyHost={CERTIFICATE_VERIFY_HOST}
          />
        </CertificateFrame>
      </div>

      {serial && (
        <Panel className="flex items-start gap-3 print:hidden" aria-label="Verification">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#157F5B] dark:text-emerald-400" aria-hidden="true" />
          <p className="break-anywhere text-sm text-muted-foreground">
            Certificate No. <span className="font-mono font-semibold text-foreground">{serial}</span> — anyone can
            confirm it at{" "}
            <a
              href={certificateVerifyUrl(serial)}
              className="font-semibold text-primary underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {CERTIFICATE_VERIFY_HOST}/{serial}
            </a>
          </p>
        </Panel>
      )}
    </div>
  );
};

export default StudentCertificate;
