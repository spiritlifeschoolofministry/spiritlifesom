import { useEffect, useState, useRef } from "react";
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

        {/* Certificate - matches the official design */}
        <div ref={certRef} className="print:m-0">
          <div
            className="relative overflow-hidden max-w-4xl mx-auto shadow-2xl print:shadow-none print:max-w-none"
            style={{
              aspectRatio: "1.414 / 1",
              backgroundImage: "url(/images/certificate-bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: "12px",
            }}
          >
            {/* Content overlay - positioned to match the certificate layout */}
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 sm:px-20 text-center">
              {/* Name area - positioned roughly where the name goes */}
              <div className="mt-[28%] sm:mt-[26%]">
                <h1
                  className="text-2xl sm:text-4xl lg:text-5xl font-bold italic"
                  style={{
                    fontFamily: "'Lucida Handwriting', 'Brush Script MT', 'Dancing Script', cursive",
                    color: "#1a1a2e",
                  }}
                >
                  {fullName}
                </h1>
              </div>

              {/* Student code - positioned to the right of name */}
              {student?.student_code && (
                <p
                  className="text-xs sm:text-sm font-bold italic mt-1"
                  style={{ color: "#1a1a2e", fontFamily: "serif" }}
                >
                  {student.student_code}
                </p>
              )}
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
