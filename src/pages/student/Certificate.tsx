import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, Lock, Edit2, Check, RotateCcw, FileDown, Image as ImageIcon, Printer, Loader2 } from "lucide-react";
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

  // The student's own graduation date wins, then their cohort's, then the
  // school-wide fallback in system_settings.
  const graduationDateText = student?.graduation_date
    ? formatDate(student.graduation_date)
    : cohortData?.graduation_date
      ? formatDate(cohortData.graduation_date)
      : globalDate;

  if (loading) {
    return (
      <>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[500px] rounded-xl" />
        </div>
      </>
    );
  }

  if (!isGraduate) {
    return (
      <>
        <div className="space-y-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Award className="w-7 h-7" /> Certificate
          </h1>
          <Card className="shadow-[var(--shadow-card)] border-border">
            <CardContent className="py-16 text-center">
              <Lock className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h2 className="text-xl font-bold text-foreground mb-2">Certificate Not Available</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Your certificate of completion will be available here once you have graduated from the program. Keep up the great work!
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <div className="space-y-4 w-full sm:w-auto">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
                <Award className="w-7 h-7" /> Certificate of Completion
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Download or print your graduation certificate.</p>
            </div>
            
            <div className="flex flex-col gap-2 max-w-sm">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name on Certificate</label>
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <>
                    <Input 
                      value={customName} 
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Enter your full name"
                      className="h-9"
                      autoFocus
                    />
                    <Button variant="outline" size="sm" onClick={handleResetName} className="shrink-0 h-9" title="Reset to profile name">
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" className="shrink-0 h-9" disabled={!customName.trim() || customName === originalFullName}>
                          <Check className="w-4 h-4 mr-2" /> Submit
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
                  </>
                ) : (
                  <>
                    <div className="px-3 py-1.5 bg-muted rounded-md text-sm font-medium border border-border flex-1">
                      {isPendingVerification ? (
                        <span className="flex items-center gap-2 italic text-muted-foreground">
                          {student?.pending_name_change} (Pending Verification)
                        </span>
                      ) : (
                        customName || "Enter name"
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsEditingName(true)} className="shrink-0 h-9" disabled={isPendingVerification}>
                      <Edit2 className="w-4 h-4 mr-2" /> {isPendingVerification ? 'Verify' : 'Edit'}
                    </Button>
                  </>
                )}
              </div>
              {isPendingVerification && (
                <p className="text-[10px] text-amber-600 font-medium">
                  * An administrator must verify your name change before it appears on the certificate.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 self-start mt-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload("pdf")}
              className="gap-2 h-10 px-4 font-semibold border-primary/20 hover:bg-primary/5"
              disabled={isDownloading}
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Save PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload("png")}
              className="gap-2 h-10 px-4 font-semibold border-primary/20 hover:bg-primary/5"
              disabled={isDownloading}
            >
              <ImageIcon className="w-4 h-4" /> Save PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-2 h-10 px-4 font-semibold border-primary/20 hover:bg-primary/5"
            >
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
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

        <div className="text-center space-y-2 print:hidden">
          <p className="text-xs text-muted-foreground">
            Saved and printed copies come out at full A4 landscape size regardless of the screen you are on.
          </p>
          {serial && (
            <p className="text-xs text-muted-foreground break-anywhere">
              Certificate No. <span className="font-mono text-foreground">{serial}</span> — anyone can
              confirm it at{" "}
              <a
                href={certificateVerifyUrl(serial)}
                className="underline hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                {CERTIFICATE_VERIFY_HOST}/{serial}
              </a>
            </p>
          )}
        </div>
      </div>
    </>
  );
};

export default StudentCertificate;
