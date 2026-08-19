import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Award, Lock, Edit2, Check, RotateCcw, FileDown, Loader2, HelpCircle } from "lucide-react";
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
// Dynamically import heavy browser-only libs when needed

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
    }
    
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

  const handlePrint = () => {
    if (!customName.trim()) {
      toast.error("Please enter a name for the certificate");
      setIsEditingName(true);
      return;
    }
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!customName.trim()) {
      toast.error("Please enter a name for the certificate");
      setIsEditingName(true);
      return;
    }

    const element = document.querySelector(".certificate-content") as HTMLElement;
    if (!element) return;

    try {
      setIsDownloading(true);
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);

      const canvas = await html2canvas(element as HTMLElement, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: null,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`SLSM_Certificate_${customName.replace(/\s+/g, '_')}.pdf`);
      toast.success('Certificate downloaded successfully');
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setIsDownloading(true);
      // Wait a bit before resetting state
      setTimeout(() => setIsDownloading(false), 1000);
    }
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

  if (loading) {
    return (
      <StudentLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[500px] rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  if (!isGraduate) {
    return (
      <StudentLayout>
        <div className="space-y-6 pb-20 md:pb-0">
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
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 pb-20 md:pb-0">
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
          <div className="flex gap-2 self-start mt-auto">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadPDF} 
              className="gap-2 h-10 px-4 font-semibold border-primary/20 hover:bg-primary/5"
              disabled={isDownloading}
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Save PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 h-10 px-4 font-semibold border-primary/20 hover:bg-primary/5">
              <Download className="w-4 h-4" /> Print
            </Button>
          </div>
        </div>

        {/* Certificate built with code to match official design */}
        <div className="print:m-0 certificate-container">
          <div
            className="relative overflow-hidden max-w-4xl mx-auto shadow-2xl print:shadow-none print:max-w-none certificate-content"
            style={{ aspectRatio: "1.414 / 1", borderRadius: "12px" }}
          >
            {/* Background */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #faf6ed 0%, #f5f0e0 30%, #eee8d5 60%, #f8f4e8 100%)" }} />

            {/* Gold wave decorations - top */}
            <svg className="absolute top-0 left-0 w-full" viewBox="0 0 1000 120" preserveAspectRatio="none" style={{ height: "15%" }}>
              <path d="M0,40 Q150,10 300,50 T600,30 T900,60 L1000,40 L1000,0 L0,0 Z" fill="rgba(201,168,76,0.12)" />
              <path d="M0,60 Q200,30 400,70 T800,40 L1000,60 L1000,0 L0,0 Z" fill="rgba(201,168,76,0.08)" />
            </svg>

            {/* Gold wave decorations - bottom */}
            <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1000 120" preserveAspectRatio="none" style={{ height: "12%", transform: "scaleY(-1)" }}>
              <path d="M0,40 Q150,10 300,50 T600,30 T900,60 L1000,40 L1000,0 L0,0 Z" fill="rgba(201,168,76,0.10)" />
            </svg>

            {/* Purple/pink corner accent - bottom left */}
            <div className="absolute bottom-0 left-0" style={{ width: "12%", height: "35%" }}>
              <svg viewBox="0 0 120 350" className="w-full h-full">
                <defs>
                  <linearGradient id="purpleGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#2d1b69" />
                    <stop offset="50%" stopColor="#6b3fa0" />
                    <stop offset="100%" stopColor="#e84393" />
                  </linearGradient>
                </defs>
                <path d="M0,350 L0,80 Q10,120 40,160 Q80,220 60,280 Q40,320 0,350 Z" fill="url(#purpleGrad)" opacity="0.9" />
                <path d="M0,350 L0,150 Q30,180 50,220 Q70,270 40,310 Q20,340 0,350 Z" fill="#e84393" opacity="0.5" />
              </svg>
            </div>

            {/* Gold medal/seal - top right */}
            <div className="absolute" style={{ top: "4%", right: "5%", width: "16%", aspectRatio: "1" }}>
              <svg viewBox="0 0 200 200" className="w-full h-full">
                {/* Red rosette */}
                {Array.from({ length: 16 }).map((_, i) => (
                  <circle key={i} cx={100 + 20 * Math.cos((i * Math.PI * 2) / 16)} cy={100 + 20 * Math.sin((i * Math.PI * 2) / 16)} r="30" fill="#c0392b" opacity="0.9" />
                ))}
                {/* Gold outer ring */}
                <circle cx="100" cy="100" r="70" fill="url(#goldGrad)" />
                {/* Gold inner ring */}
                <circle cx="100" cy="100" r="55" fill="url(#goldGrad2)" />
                {/* Red ribbon tails */}
                <path d="M85,165 L75,230 L100,210 L95,170 Z" fill="#c0392b" />
                <path d="M115,165 L125,230 L100,210 L105,170 Z" fill="#c0392b" />
                <defs>
                  <radialGradient id="goldGrad" cx="40%" cy="35%">
                    <stop offset="0%" stopColor="#f0d78c" />
                    <stop offset="50%" stopColor="#c9a84c" />
                    <stop offset="100%" stopColor="#a08030" />
                  </radialGradient>
                  <radialGradient id="goldGrad2" cx="45%" cy="40%">
                    <stop offset="0%" stopColor="#f5e6b0" />
                    <stop offset="40%" stopColor="#d4b85c" />
                    <stop offset="100%" stopColor="#b8942e" />
                  </radialGradient>
                </defs>
              </svg>
            </div>

            {/* Content */}
            <div className="absolute inset-0 flex flex-col items-center" style={{ padding: "5% 8%" }}>
              {/* Header: Logo + School Name */}
              <div className="flex items-center gap-3 sm:gap-4 mb-2" style={{ marginTop: "2%" }}>
                <img
                  src="/certificate-logo.png"
                  alt="Spirit Life School of Ministry"
                  className="w-16 h-16 sm:w-20 sm:h-20 lg:w-28 lg:h-28 object-contain"
                  style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.12))" }}
                />
                <h2
                  className="text-xl sm:text-3xl lg:text-4xl font-black uppercase tracking-wide"
                  style={{ color: "#5B2D8E", fontFamily: "'Georgia', serif", letterSpacing: "2px" }}
                >
                  The Spirit Life<br />School of Ministry
                </h2>
              </div>

              {/* Certificate of Completion */}
              <h3
                className="text-lg sm:text-2xl lg:text-3xl italic mt-2 sm:mt-4"
                style={{ color: "#c0392b", fontFamily: "'Georgia', serif" }}
              >
                Certificate of Completion
              </h3>

              {/* Certify text */}
              <p className="text-xs sm:text-sm mt-2 sm:mt-3" style={{ color: "#444", fontFamily: "serif" }}>
                This is to proudly certify that
              </p>

              {/* Student Name */}
              <div className="mt-4 sm:mt-6 flex items-end gap-3 sm:gap-6 w-full justify-center">
                <h1
                  className="text-xl sm:text-3xl lg:text-4xl font-bold italic"
                  style={{
                    fontFamily: "'Georgia', 'Brush Script MT', cursive",
                  color: "#1a1a2e",
                }}
              >
                {customName || fullName}
              </h1>
              {(student?.student_code || student?.graduation_date || cohortData?.graduation_date) && (
                <div className="flex flex-col items-end">
                  {student?.student_code && (
                    <span
                      className="text-xs sm:text-sm font-bold italic whitespace-nowrap"
                      style={{ color: "#1a1a2e", fontFamily: "serif" }}
                    >
                      {student.student_code}
                    </span>
                  )}
                </div>
              )}
            </div>

              {/* Line under name */}
              <div className="w-3/4 sm:w-2/3 mt-1 flex items-center gap-2">
                <div className="flex-1 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #1a1a2e, transparent)" }} />
              </div>

              {/* Completion text */}
              <p className="text-xs sm:text-sm text-center mt-3 sm:mt-4 leading-relaxed px-4" style={{ color: "#444", fontFamily: "serif", maxWidth: "85%" }}>
                {cohortData?.certificate_text_main || 'has successfully completed a year of intensive training and teaching in the School of Ministry'}
                {cohortData?.certificate_text_sub && <><br />{cohortData.certificate_text_sub}</>}
              </p>

              {/* Date */}
              <p className="text-xs sm:text-sm font-bold mt-3 sm:mt-5" style={{ color: "#1a1a2e", fontFamily: "serif" }}>
                DATE: {student?.graduation_date 
                  ? new Date(student.graduation_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) 
                  : cohortData?.graduation_date 
                    ? new Date(cohortData.graduation_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : globalDate}
              </p>

              {/* Signatories */}
              <div className="flex justify-between w-full mt-auto pb-4 sm:pb-6 px-4 sm:px-12" style={{ marginTop: "auto" }}>
                <div className="text-center">
                  <p className="text-xs sm:text-sm font-bold uppercase" style={{ color: "#1a1a2e", fontFamily: "serif" }}>
                    Pastor Folakemi Obadare
                  </p>
                  <p className="text-[10px] sm:text-xs uppercase tracking-wider" style={{ color: "#666", fontFamily: "serif" }}>
                    Residence Pastor
                  </p>
                </div>
                {/* Scroll icon placeholder */}
                <div className="flex items-center">
                  <span className="text-2xl sm:text-3xl">📜</span>
                </div>
                <div className="text-center">
                  <p className="text-xs sm:text-sm font-bold uppercase" style={{ color: "#1a1a2e", fontFamily: "serif" }}>
                    Prophet Cherub Obadare
                  </p>
                  <p className="text-[10px] sm:text-xs uppercase tracking-wider" style={{ color: "#666", fontFamily: "serif" }}>
                    Founder/Proprietor
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground print:hidden">
          Use "Print / Save PDF" to download a high-quality copy of your certificate.
        </p>
      </div>
    </StudentLayout>
  );
};

export default StudentCertificate;
