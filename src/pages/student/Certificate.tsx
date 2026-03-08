import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, GraduationCap, Award, Lock } from "lucide-react";

const StudentCertificate = () => {
  const { student, profile } = useAuth();
  const [cohortName, setCohortName] = useState("");
  const [loading, setLoading] = useState(true);
  const certRef = useRef<HTMLDivElement>(null);

  const isGraduate = (student?.admission_status || "").toUpperCase() === "GRADUATE";

  useEffect(() => {
    if (!student?.cohort_id) { setLoading(false); return; }
    supabase.from("cohorts").select("name").eq("id", student.cohort_id).single().then(({ data }) => {
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

        {/* Certificate */}
        <div ref={certRef} className="print:m-0">
          <div className="relative bg-background border-[3px] border-primary/20 rounded-2xl overflow-hidden max-w-3xl mx-auto shadow-xl print:shadow-none print:border-2 print:max-w-none">
            {/* Decorative border */}
            <div className="absolute inset-3 border-2 border-primary/10 rounded-xl pointer-events-none" />

            {/* Watermark logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img src="/images/logo.png" alt="" className="w-[320px] h-[320px] object-contain opacity-[0.04] select-none" draggable={false} />
            </div>
            
            {/* Top accent */}
            <div className="h-3 gradient-flame" />
            
            <div className="px-8 sm:px-16 py-12 sm:py-16 text-center relative">
              {/* Logo area */}
              <div className="mb-6">
                <img src="/images/logo.png" alt="SLSM Logo" className="w-24 h-24 mx-auto mb-4 object-contain" />
                <h2 className="text-lg font-bold text-primary tracking-widest uppercase">
                  Spirit Life School of Ministry
                </h2>
              </div>

              <p className="text-muted-foreground text-sm tracking-wider uppercase mb-8">
                Certificate of Completion
              </p>

              <p className="text-muted-foreground text-sm mb-2">This is to certify that</p>

              <h1 className="text-3xl sm:text-4xl font-black text-foreground mb-2 py-3 border-b-2 border-primary/20 inline-block px-8">
                {fullName}
              </h1>

              <p className="text-muted-foreground text-sm mt-6 mb-2">
                has successfully completed the program of study at
              </p>
              <p className="text-foreground font-semibold text-lg mb-1">
                Spirit Life School of Ministry
              </p>
              {cohortName && (
                <p className="text-muted-foreground text-sm mb-8">
                  Cohort: {cohortName}
                </p>
              )}

              {student?.student_code && (
                <p className="text-xs text-muted-foreground mb-8 font-mono">
                  Student ID: {student.student_code}
                </p>
              )}

              {/* Signature line */}
              <div className="flex justify-center gap-16 sm:gap-24 mt-12">
                <div className="text-center">
                  <div className="w-32 border-b border-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Director</p>
                </div>
                <div className="text-center">
                  <div className="w-32 border-b border-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Date</p>
                </div>
              </div>

              {/* Decorative corners */}
              <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-primary/30 rounded-tl-lg" />
              <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-primary/30 rounded-tr-lg" />
              <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-primary/30 rounded-bl-lg" />
              <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-primary/30 rounded-br-lg" />
            </div>

            {/* Bottom accent */}
            <div className="h-3 gradient-purple" />
          </div>
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentCertificate;
