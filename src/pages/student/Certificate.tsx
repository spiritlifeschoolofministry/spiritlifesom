import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
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

// Palette and type stack of the official printed certificate.
const NAVY = "#17325c";
const RED = "#c1272d";
const CREAM = "#fdf9ec";
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SCRIPT = "'Yellowtail', 'Brush Script MT', cursive";
const BODY = "'Nunito', 'Segoe UI', system-ui, sans-serif";

const FONT_LINK_ID = "certificate-fonts";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=Yellowtail&family=Nunito:wght@300;400;600&display=swap";

// The certificate is the only page that needs these faces, so fetch them here
// rather than blocking every first paint from index.html.
const loadCertificateFonts = () => {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
};

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
    
    loadCertificateFonts();
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

      // html2canvas snapshots whatever is painted, so a half-loaded webfont
      // would bake the fallback face into the PDF.
      await document.fonts?.ready;

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
      setIsDownloading(false);
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

        {/* Certificate built with code to match the official printed design */}
        <div className="print:m-0 certificate-container">
          <div
            className="relative overflow-hidden max-w-4xl mx-auto shadow-2xl print:shadow-none print:max-w-none certificate-content"
            style={{ aspectRatio: "1.414 / 1", borderRadius: "12px", background: CREAM }}
          >
            {/* Ivory paper ground with a faint warm sheen */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 90% at 15% 10%, #fffdf6 0%, #fdf9ec 45%, #f7f1de 100%)",
              }}
            />

            {/* Cream ribbon sweeping out of the top-left corner */}
            <svg
              className="absolute top-0 left-0"
              style={{ width: "42%", height: "22%" }}
              viewBox="0 0 700 260"
              preserveAspectRatio="none"
            >
              <path
                d="M0,0 H660 C440,26 210,74 70,158 C38,180 14,212 0,236 Z"
                fill="#f3ead4"
                opacity="0.75"
              />
              <path
                d="M0,0 H430 C300,22 160,58 66,124 C36,146 14,176 0,198 Z"
                fill="#ece0c0"
                opacity="0.6"
              />
              {Array.from({ length: 6 }).map((_, i) => (
                <path
                  key={i}
                  d={`M0,${34 + i * 30} C170,${16 + i * 26} 400,${-4 + i * 22} 660,${-44 + i * 20}`}
                  fill="none"
                  stroke="#e0d2ab"
                  strokeWidth="3"
                  opacity={0.55 - i * 0.06}
                />
              ))}
            </svg>

            {/* Matching whisper of ribbon in the bottom-right corner */}
            <svg
              className="absolute bottom-0 right-0"
              style={{ width: "34%", height: "16%" }}
              viewBox="0 0 560 200"
              preserveAspectRatio="none"
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <path
                  key={i}
                  d={`M560,${170 - i * 26} C380,${190 - i * 22} 170,${196 - i * 18} 0,${210 - i * 16}`}
                  fill="none"
                  stroke="#e6dabb"
                  strokeWidth="3"
                  opacity={0.4 - i * 0.07}
                />
              ))}
            </svg>

            {/* Layered purple-to-magenta ribbon fan, bottom-left corner */}
            <div className="absolute bottom-0 left-0" style={{ width: "23%", height: "24%" }}>
              <svg viewBox="0 0 460 340" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0,26 C150,110 285,225 360,340 L0,340 Z" fill="#3a1878" />
                <path d="M0,96 C140,168 250,258 306,340 L0,340 Z" fill="#7b28c4" />
                <path d="M0,158 C118,214 205,272 252,340 L0,340 Z" fill="#c4359f" />
                <path d="M0,214 C92,252 152,296 190,340 L0,340 Z" fill="#f4499f" />
                <path d="M0,272 C58,296 104,318 128,340 L0,340 Z" fill="#ff77bd" opacity="0.85" />
              </svg>
            </div>

            {/* Gold medal with red rosette and ribbon tails, top-right */}
            <div className="absolute" style={{ top: "1.5%", right: "3.5%", width: "23%" }}>
              <svg viewBox="0 0 240 300" className="w-full">
                <defs>
                  <radialGradient id="certGoldOuter" cx="38%" cy="30%" r="75%">
                    <stop offset="0%" stopColor="#f7e6a8" />
                    <stop offset="45%" stopColor="#d7b558" />
                    <stop offset="100%" stopColor="#9d7c26" />
                  </radialGradient>
                  <radialGradient id="certGoldInner" cx="42%" cy="34%" r="72%">
                    <stop offset="0%" stopColor="#fbf1c8" />
                    <stop offset="40%" stopColor="#dcbe66" />
                    <stop offset="100%" stopColor="#b28f34" />
                  </radialGradient>
                </defs>

                {/* Ribbon tails hanging below the medal */}
                <path d="M92,152 L58,296 L104,258 L112,164 Z" fill="#c62828" />
                <path d="M148,152 L182,296 L136,258 L128,164 Z" fill="#c62828" />
                <path d="M148,152 L164,220 L136,206 Z" fill="#a81f1f" opacity="0.5" />

                {/* Scalloped red rosette */}
                {Array.from({ length: 22 }).map((_, i) => {
                  const a = (i * Math.PI * 2) / 22;
                  return (
                    <circle
                      key={i}
                      cx={120 + 78 * Math.cos(a)}
                      cy={120 + 78 * Math.sin(a)}
                      r="24"
                      fill={i % 2 ? "#c0261f" : "#d63028"}
                    />
                  );
                })}
                <circle cx="120" cy="120" r="82" fill="#cf2a22" />

                {/* Gold discs */}
                <circle cx="120" cy="120" r="70" fill="url(#certGoldOuter)" />
                <circle cx="120" cy="120" r="62" fill="#b8912f" />
                <circle cx="120" cy="120" r="58" fill="url(#certGoldInner)" />

                {/* Brushed-metal spokes across the inner disc */}
                {Array.from({ length: 36 }).map((_, i) => {
                  const a1 = (i * Math.PI * 2) / 36;
                  const a2 = ((i + 0.5) * Math.PI * 2) / 36;
                  return (
                    <path
                      key={i}
                      d={`M120,120 L${120 + 58 * Math.cos(a1)},${120 + 58 * Math.sin(a1)} L${120 + 58 * Math.cos(a2)},${120 + 58 * Math.sin(a2)} Z`}
                      fill={i % 2 ? "#c9a54a" : "#e6cd82"}
                      opacity="0.35"
                    />
                  );
                })}
                <circle cx="120" cy="120" r="58" fill="url(#certGoldInner)" opacity="0.45" />
                <ellipse cx="98" cy="96" rx="26" ry="18" fill="#fdf4d2" opacity="0.35" />
              </svg>
            </div>

            {/* Header: logo + school name */}
            <div className="absolute flex items-center gap-2 sm:gap-4" style={{ left: "19%", top: "4.5%" }}>
              <div
                className="rounded-full bg-white shrink-0 flex items-center justify-center w-12 h-12 sm:w-[4.6rem] sm:h-[4.6rem] lg:w-[7.1rem] lg:h-[7.1rem]"
                style={{ boxShadow: "0 1px 5px rgba(0,0,0,0.08)" }}
              >
                <img
                  src="/certificate-logo.png"
                  alt="Spirit Life School of Ministry"
                  className="w-[94%] h-[94%] object-contain rounded-full"
                />
              </div>
              <h2
                className="font-black uppercase text-xl sm:text-4xl lg:text-5xl"
                style={{ color: NAVY, fontFamily: SERIF, lineHeight: 0.92, letterSpacing: "0.01em" }}
              >
                School of<br />Ministry
              </h2>
            </div>

            {/* Certificate of Completion */}
            <div className="absolute inset-x-0 text-center" style={{ top: "34%" }}>
              <span
                className="text-lg sm:text-3xl lg:text-[2.6rem]"
                style={{ color: RED, fontFamily: SCRIPT, lineHeight: 1.2 }}
              >
                Certificate of Completion
              </span>
            </div>

            {/* Certify text */}
            <p
              className="absolute inset-x-0 text-center text-[0.55rem] sm:text-sm lg:text-base"
              style={{ top: "42.5%", color: "#4a4a4a", fontFamily: SERIF }}
            >
              This is to proudly certify that
            </p>

            {/* Student name + matriculation code */}
            <div
              className="absolute inset-x-0 flex items-baseline justify-center gap-2 sm:gap-4 lg:gap-6 px-[8%]"
              style={{ top: "52.5%" }}
            >
              <h1
                className="font-bold italic text-xl sm:text-3xl lg:text-[2.75rem]"
                style={{ fontFamily: SERIF, color: NAVY, lineHeight: 1.1 }}
              >
                {customName || fullName}
              </h1>
              {student?.student_code && (
                <span
                  className="font-bold italic whitespace-nowrap text-[0.6rem] sm:text-base lg:text-xl"
                  style={{ color: "#5f6470", fontFamily: SERIF }}
                >
                  {student.student_code}
                </span>
              )}
            </div>

            {/* Diamond-tipped rule under the name */}
            <div
              className="absolute flex items-center"
              style={{ top: "62%", left: "20.5%", right: "20.5%" }}
            >
              <span className="shrink-0 rotate-45 w-1.5 h-1.5 sm:w-2 sm:h-2" style={{ background: NAVY }} />
              <span className="flex-1" style={{ height: "1.5px", background: NAVY }} />
              <span className="shrink-0 rotate-45 w-1.5 h-1.5 sm:w-2 sm:h-2" style={{ background: NAVY }} />
            </div>

            {/* Completion text */}
            <p
              className="absolute inset-x-0 text-center text-[0.55rem] sm:text-sm lg:text-lg"
              style={{
                top: "64.5%",
                color: "#4a4a4a",
                fontFamily: BODY,
                lineHeight: 1.55,
                paddingLeft: "12%",
                paddingRight: "12%",
              }}
            >
              {cohortData?.certificate_text_main ||
                "has successfully completed a year of intensive training and teaching in the School of Ministry"}
              {cohortData?.certificate_text_sub && (
                <>
                  <br />
                  {cohortData.certificate_text_sub}
                </>
              )}
            </p>

            {/* Date */}
            <p
              className="absolute inset-x-0 text-center font-bold text-[0.6rem] sm:text-base lg:text-xl"
              style={{ top: "75%", color: NAVY, fontFamily: SERIF }}
            >
              DATE:{" "}
              {student?.graduation_date
                ? new Date(student.graduation_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                : cohortData?.graduation_date
                  ? new Date(cohortData.graduation_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                  : globalDate}
            </p>

            {/* Rolled diploma scroll between the signatures */}
            <div className="absolute" style={{ top: "86.5%", left: "45%", width: "10%" }}>
              <svg viewBox="0 0 200 110" className="w-full">
                <defs>
                  <linearGradient id="certScroll" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f7dd9b" />
                    <stop offset="55%" stopColor="#e6c063" />
                    <stop offset="100%" stopColor="#c79f3f" />
                  </linearGradient>
                </defs>
                <rect x="26" y="34" width="148" height="44" rx="6" fill="url(#certScroll)" />
                <path d="M40,44 H160 M40,56 H160 M40,68 H140" stroke="#c9a24a" strokeWidth="2" opacity="0.45" />
                <ellipse cx="28" cy="56" rx="15" ry="26" fill="#e8c470" stroke="#b8912f" strokeWidth="2" />
                <ellipse cx="28" cy="56" rx="6" ry="11" fill="#c79f3f" />
                <ellipse cx="172" cy="56" rx="15" ry="26" fill="#e8c470" stroke="#b8912f" strokeWidth="2" />
                <ellipse cx="172" cy="56" rx="6" ry="11" fill="#c79f3f" />
                <rect x="86" y="30" width="13" height="52" fill="#ef5b93" />
                <path d="M92,40 C72,20 60,34 78,44 Z" fill="#f4749f" />
                <path d="M94,40 C114,20 126,34 108,44 Z" fill="#f4749f" />
                <circle cx="93" cy="43" r="6" fill="#ef5b93" />
              </svg>
            </div>

            {/* Signatories */}
            <div
              className="absolute flex justify-between items-start"
              style={{ top: "88.5%", left: "9%", right: "9%" }}
            >
              <div className="text-center">
                <p
                  className="font-bold uppercase text-[0.55rem] sm:text-sm lg:text-lg"
                  style={{ color: NAVY, fontFamily: SERIF }}
                >
                  Pastor Folakemi Obadare
                </p>
                <p
                  className="uppercase text-[0.5rem] sm:text-xs lg:text-base"
                  style={{ color: "#5f6672", fontFamily: SERIF, letterSpacing: "0.04em" }}
                >
                  Residence Pastor
                </p>
              </div>
              <div className="text-center">
                <p
                  className="font-bold uppercase text-[0.55rem] sm:text-sm lg:text-lg"
                  style={{ color: NAVY, fontFamily: SERIF }}
                >
                  Prophet Cherub Obadare
                </p>
                <p
                  className="uppercase text-[0.5rem] sm:text-xs lg:text-base"
                  style={{ color: "#5f6672", fontFamily: SERIF, letterSpacing: "0.04em" }}
                >
                  Founder/Proprietor
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground print:hidden">
          Use "Print / Save PDF" to download a high-quality copy of your certificate.
        </p>
      </div>
    </>
  );
};

export default StudentCertificate;
