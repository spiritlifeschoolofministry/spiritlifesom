import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Award, Lock } from "lucide-react";

const StudentCertificate = () => {
  const { student, profile } = useAuth();
  const [cohortName, setCohortName] = useState("");
  const [loading, setLoading] = useState(true);

  const isGraduate = (student?.admission_status || "").toUpperCase() === "GRADUATE";

  useEffect(() => {
    if (!student?.cohort_id) { setLoading(false); return; }
    supabase.from("cohorts").select("name, end_date").eq("id", student.cohort_id).single().then(({ data }) => {
      if (data) setCohortName(data.name);
      setLoading(false);
    });
  }, [student?.cohort_id]);

  const handlePrint = () => window.print();

  const fullName = `${profile?.first_name || ""} ${profile?.middle_name || ""} ${profile?.last_name || ""}`.replace(/\s+/g, " ").trim();

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Award className="w-7 h-7" /> Certificate of Completion
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Download or print your graduation certificate.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 print:hidden self-start">
            <Download className="w-4 h-4" /> Print / Save PDF
          </Button>
        </div>

        {/* Certificate built with code to match official design */}
        <div className="print:m-0">
          <div
            className="relative overflow-hidden max-w-4xl mx-auto shadow-2xl print:shadow-none print:max-w-none"
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
                  {fullName}
                </h1>
                {student?.student_code && (
                  <span
                    className="text-xs sm:text-sm font-bold italic whitespace-nowrap"
                    style={{ color: "#1a1a2e", fontFamily: "serif" }}
                  >
                    {student.student_code}
                  </span>
                )}
              </div>

              {/* Line under name */}
              <div className="w-3/4 sm:w-2/3 mt-1 flex items-center gap-2">
                <div className="flex-1 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #1a1a2e, transparent)" }} />
              </div>

              {/* Completion text */}
              <p className="text-xs sm:text-sm text-center mt-3 sm:mt-4 leading-relaxed" style={{ color: "#444", fontFamily: "serif", maxWidth: "70%" }}>
                has successfully completed a year of intensive training<br />
                and teaching in the School of Ministry
              </p>

              {/* Date */}
              <p className="text-xs sm:text-sm font-bold mt-3 sm:mt-5" style={{ color: "#1a1a2e", fontFamily: "serif" }}>
                DATE: 20th April, 2025
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
