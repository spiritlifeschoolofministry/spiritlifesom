import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StepIndicator from "@/components/StepIndicator";
import LearningModeCard from "@/components/LearningModeCard";
import ApplyFrame, { backButtonClass, continueButtonClass } from "@/components/redesign/apply/ApplyFrame";
import { Field, NativeSelect, Optional, fieldClass } from "@/components/redesign/apply/fields";
import { LEARNING_MODES } from "@/components/redesign/apply/learning-modes";
import { ArrowRight, Check, Loader2 } from "lucide-react";
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
  gender: z.enum(["Male", "Female"], { error: "Select your gender" }),
  age: z.number({ error: (iss) => (iss.code === "invalid_type" ? "Enter your age" : undefined) }).int().min(10, "Age must be 10+").max(100),
  // Hybrid is assigned by admin, not chosen by the student.
  learningMode: z.enum(["Physical", "Online"], { error: "Choose a learning mode" }),
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

  const isLast = stepIdx >= steps.length - 1;
  const title =
    current.key === "name"
      ? "What's your name?"
      : current.key === "contact"
        ? "Where can we reach you?"
        : missing.includes("learning_mode")
          ? "How will you study?"
          : "A few more details";
  const errorProps = (key: string) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {};

  return (
    <>
      <SEO title="Complete your profile | SLSOM" description="Finish setting up your Spirit Life SOM student account." path="/complete-profile" />
      <ApplyFrame
        className="min-h-dvh sm:items-center"
        leading={
          <img src="/images/school-logo.png" alt="Spirit Life School of Ministry" className="h-11 w-11 object-contain" />
        }
        status={
          <span className="text-[13px] font-semibold text-muted-foreground">
            {filledCount} of {REQUIRED_FIELD_COUNT} done
          </span>
        }
        progress={
          <div className="flex flex-col gap-2">
            <StepIndicator currentStep={Math.min(stepIdx + 1, steps.length)} steps={steps.map((s) => s.title)} />
            <span className="sr-only">{progressPct}% of your profile is complete.</span>
          </div>
        }
        titleId="complete-step-title"
        title={title}
        description={
          <>Just {missing.length} quick {missing.length === 1 ? "field" : "fields"} left before you can access your dashboard.</>
        }
        onSubmit={(e) => { e.preventDefault(); handleNext(); }}
        footer={
          <>
            {stepIdx > 0 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={saving} className={backButtonClass}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={saving} className={continueButtonClass}>
              {saving ? (<><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Saving…</>)
                : isLast
                  ? (<>Finish <Check className="h-5 w-5" aria-hidden="true" /></>)
                  : (<>Continue <ArrowRight className="h-5 w-5" aria-hidden="true" /></>)}
            </Button>
          </>
        }
      >
        {current.key === "name" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" htmlFor="fn" error={errors.firstName} errorId="firstName-error">
                <Input id="fn" autoComplete="given-name" aria-required="true" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus className={fieldClass} {...errorProps("firstName")} />
              </Field>
              <Field label="Last name" htmlFor="ln" error={errors.lastName} errorId="lastName-error">
                <Input id="ln" autoComplete="family-name" aria-required="true" value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClass} {...errorProps("lastName")} />
              </Field>
            </div>
            <Field label={<>Middle name<Optional /></>} htmlFor="mn">
              <Input id="mn" autoComplete="additional-name" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={fieldClass} />
            </Field>
          </>
        )}

        {current.key === "contact" && (
          <Field
            label="WhatsApp number"
            htmlFor="phone"
            hint="We send your admission update here."
            hintId="phone-hint"
            error={errors.phone}
            errorId="phone-error"
          >
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-required="true"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 …"
              autoFocus
              className={fieldClass}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={errors.phone ? "phone-hint phone-error" : "phone-hint"}
            />
          </Field>
        )}

        {current.key === "details" && (
          <>
            {missing.includes("learning_mode") && (
              <fieldset
                className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0"
                aria-describedby={errors.learningMode ? "learningMode-error" : undefined}
              >
                <legend className="mb-2.5 text-sm font-semibold text-foreground">Learning mode</legend>
                {LEARNING_MODES.map((m) => (
                  <LearningModeCard
                    key={m.value}
                    name="learningMode"
                    value={m.value}
                    title={m.title}
                    description={m.description}
                    price={m.price}
                    details={[...m.details]}
                    selected={learningMode === m.value}
                    onSelect={() => setLearningMode(m.value)}
                  />
                ))}
                {errors.learningMode && (
                  <p id="learningMode-error" role="alert" className="text-[13px] font-medium text-destructive">{errors.learningMode}</p>
                )}
              </fieldset>
            )}
            {(missing.includes("gender") || missing.includes("age")) && (
              <div className="flex items-start gap-3">
                {missing.includes("gender") && (
                  <Field label="Gender" htmlFor="gender" error={errors.gender} errorId="gender-error" className="flex-1">
                    <NativeSelect id="gender" aria-required="true" value={gender} onChange={(e) => setGender(e.target.value)} {...errorProps("gender")}>
                      <option value="" disabled>Select</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                    </NativeSelect>
                  </Field>
                )}
                {missing.includes("age") && (
                  <Field
                    label="Age"
                    htmlFor="age"
                    error={errors.age}
                    errorId="age-error"
                    className={missing.includes("gender") ? "w-[110px] shrink-0" : "w-full max-w-[160px]"}
                  >
                    <Input
                      id="age"
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={100}
                      aria-required="true"
                      placeholder="e.g. 28"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className={fieldClass}
                      {...errorProps("age")}
                    />
                  </Field>
                )}
              </div>
            )}
          </>
        )}
      </ApplyFrame>
    </>
  );
};

export default CompleteProfile;
