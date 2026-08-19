import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import SEO from "@/components/SEO";
import { saveProfileCompletion } from "@/lib/complete-profile-save";
import {
  isStudentProfileComplete,
  missingProfileFields,
  REQUIRED_FIELD_COUNT,
  type MissingProfileField,
} from "@/lib/profile-complete";

const nameSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  middleName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
});

const contactSchema = z.object({
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
});

const detailsSchema = z.object({
  gender: z.enum(["Male", "Female"], { errorMap: () => ({ message: "Select your gender" }) }),
  age: z.number({ invalid_type_error: "Enter your age" }).int().min(10, "Age must be 10+").max(100),
  learningMode: z.enum(["Physical", "Online"], { errorMap: () => ({ message: "Choose a learning mode" }) }),
});

type StepKey = "name" | "contact" | "details";

const CompleteProfile = () => {
  const navigate = useNavigate();
  const { user, profile, student, role, isLoading, isProfileResolved, refreshProfile } = useAuth();

  const submittingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [learningMode, setLearningMode] = useState<string>("");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setMiddleName(profile.middle_name || "");
      setLastName(profile.last_name || "");
      setPhone(profile.phone || "");
    }
    if (student) {
      setGender(student.gender || "");
      setAge(student.age ? String(student.age) : "");
      setLearningMode(student.learning_mode || "");
    }
  }, [profile, student]);

  // Skip if already done. Waits for a settled profile read — acting while the
  // rows are still in flight is how this page used to appear for a moment to
  // people who had already filled it in.
  useEffect(() => {
    if (isLoading || !isProfileResolved) return;
    if (!user) { navigate("/login", { replace: true }); return; }
    if (isStudentProfileComplete(profile, student)) {
      const r = (role || "").toLowerCase();
      navigate(r === "admin" || r === "teacher" ? "/admin/dashboard" : "/student/dashboard", { replace: true });
    }
  }, [isLoading, isProfileResolved, user, profile, student, role, navigate]);

  // Build only the steps that have at least one missing field
  const missing = useMemo<MissingProfileField[]>(
    () => missingProfileFields(profile, student),
    [profile, student],
  );

  const steps = useMemo<{ key: StepKey; title: string }[]>(() => {
    const s: { key: StepKey; title: string }[] = [];
    if (missing.includes("first_name") || missing.includes("last_name")) s.push({ key: "name", title: "Your name" });
    if (missing.includes("phone")) s.push({ key: "contact", title: "Contact" });
    if (missing.includes("gender") || missing.includes("age") || missing.includes("learning_mode"))
      s.push({ key: "details", title: "Student details" });
    return s.length ? s : [{ key: "details", title: "Confirm details" }];
  }, [missing]);

  const filledCount = REQUIRED_FIELD_COUNT - missing.length;
  const progressPct = Math.round((filledCount / REQUIRED_FIELD_COUNT) * 100);
  const current = steps[Math.min(stepIdx, steps.length - 1)];

  const validateStep = (key: StepKey): boolean => {
    const e: Record<string, string> = {};
    if (key === "name") {
      const r = nameSchema.safeParse({ firstName, middleName, lastName });
      if (!r.success) r.error.issues.forEach((i) => { e[i.path[0] as string] = i.message; });
    } else if (key === "contact") {
      const r = contactSchema.safeParse({ phone });
      if (!r.success) r.error.issues.forEach((i) => { e[i.path[0] as string] = i.message; });
    } else if (key === "details") {
      const r = detailsSchema.safeParse({
        gender,
        age: age ? parseInt(age, 10) : NaN,
        learningMode,
      });
      if (!r.success) r.error.issues.forEach((i) => { e[i.path[0] as string] = i.message; });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(current.key)) return;
    if (stepIdx < steps.length - 1) {
      setStepIdx((i) => i + 1);
      setErrors({});
    } else {
      void handleSubmit();
    }
  };

  const handleBack = () => {
    setErrors({});
    setStepIdx((i) => Math.max(0, i - 1));
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (submittingRef.current) return;
    // Final full validation across all relevant fields
    for (const s of steps) {
      if (!validateStep(s.key)) {
        const idx = steps.findIndex((x) => x.key === s.key);
        setStepIdx(idx);
        return;
      }
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      await saveProfileCompletion({
        userId: user.id,
        email: user.email ?? "",
        firstName,
        middleName,
        lastName,
        phone,
        gender,
        age: parseInt(age, 10),
        learningMode,
        missing,
      });

      toast.success("Profile completed! Welcome aboard.");
      // Re-read auth state in place, then route client-side. A full page load
      // here threw away the whole app just to pick up the saved fields.
      await refreshProfile();
      const r = (role || "").toLowerCase();
      navigate(r === "admin" || r === "teacher" ? "/admin/dashboard" : "/student/dashboard", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save profile";
      toast.error(msg);
      submittingRef.current = false;
      setSaving(false);
    }
  };

  // Same reason: never paint the form (or its "N fields left" count) until we
  // know what is actually missing.
  if (isLoading || (user && !isProfileResolved) || (isProfileResolved && isStudentProfileComplete(profile, student))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <SEO title="Complete your profile | SLSOM" description="Finish setting up your Spirit Life SOM student account." path="/complete-profile" />
      <div className="w-full max-w-lg bg-card rounded-2xl shadow-[var(--shadow-card)] border border-border p-8">
        <h1 className="text-2xl font-bold text-primary mb-1">Complete your profile</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Just {missing.length} quick {missing.length === 1 ? "field" : "fields"} left before you can access your dashboard.
        </p>

        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Step {Math.min(stepIdx + 1, steps.length)} of {steps.length} — {current.title}</span>
            <span>{filledCount}/{REQUIRED_FIELD_COUNT} done</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-4">
          {current.key === "name" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="fn">First name *</Label>
                <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
                {errors.firstName && <p className="text-xs text-destructive mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <Label htmlFor="mn">Middle name</Label>
                <Input id="mn" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ln">Last name *</Label>
                <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                {errors.lastName && <p className="text-xs text-destructive mt-1">{errors.lastName}</p>}
              </div>
            </div>
          )}

          {current.key === "contact" && (
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." autoFocus />
              {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
            </div>
          )}

          {current.key === "details" && (
            <div className="space-y-4">
              {missing.includes("gender") && (
                <div>
                  <Label>Gender *</Label>
                  <RadioGroup value={gender} onValueChange={setGender} className="flex gap-6 mt-2">
                    <div className="flex items-center gap-2"><RadioGroupItem value="Male" id="g-m" /><Label htmlFor="g-m">Male</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="Female" id="g-f" /><Label htmlFor="g-f">Female</Label></div>
                  </RadioGroup>
                  {errors.gender && <p className="text-xs text-destructive mt-1">{errors.gender}</p>}
                </div>
              )}
              {missing.includes("age") && (
                <div>
                  <Label htmlFor="age">Age *</Label>
                  <Input id="age" type="number" min={10} max={100} value={age} onChange={(e) => setAge(e.target.value)} />
                  {errors.age && <p className="text-xs text-destructive mt-1">{errors.age}</p>}
                </div>
              )}
              {missing.includes("learning_mode") && (
                <div>
                  <Label>Learning mode *</Label>
                  <Select value={learningMode} onValueChange={setLearningMode}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="How will you attend?" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Physical">Physical (in-person)</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.learningMode && <p className="text-xs text-destructive mt-1">{errors.learningMode}</p>}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" onClick={handleBack} disabled={stepIdx === 0 || saving} className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button type="submit" variant="flame" disabled={saving} className="gap-2">
              {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>)
                : stepIdx === steps.length - 1
                  ? (<>Finish <Check className="w-4 h-4" /></>)
                  : (<>Next <ArrowRight className="w-4 h-4" /></>)}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;
