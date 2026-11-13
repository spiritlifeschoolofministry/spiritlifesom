import { useState, useEffect } from "react";
import { isSignupRefusal } from "@/lib/signup-closed";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from '@/integrations/supabase/types';
import { r2Storage } from "@/lib/r2-storage";

import StepIndicator from "@/components/StepIndicator";
import LearningModeCard from "@/components/LearningModeCard";
import ApplyFrame, { backButtonClass, continueButtonClass } from "@/components/redesign/apply/ApplyFrame";
import ApplyClosed from "@/components/redesign/apply/ApplyClosed";
import { ChoiceGroup, Field, NativeSelect, Optional, fieldClass, textareaClass } from "@/components/redesign/apply/fields";
import { LEARNING_MODES } from "@/components/redesign/apply/learning-modes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Camera, Check, ChevronLeft, Eye, EyeOff, Loader2, Upload } from "lucide-react";
import SEO from "@/components/SEO";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { format } from "date-fns";

import { toast } from "sonner";

const STEPS = ["Your account", "About you", "Study & commitment"];
const STEP_TITLES = ["Create your account", "Tell us about yourself", "How will you study?"];
const STEP_INTROS = [
  "Use Google, or sign up with your email.",
  "These help us get to know you. None of them is required.",
  "Pick a learning mode, then sign the statement of intent.",
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

const iconButtonClass =
  "flex h-11 w-11 items-center justify-center rounded-xl border border-border text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const eyeButtonClass =
  "absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground focus:outline-none";

interface FormData {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  passportPhoto: File | null;
  photoUrl: string;
  gender: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  maritalStatus: string;
  address: string;
  isBornAgain: string;
  hasDiscoveredMinistry: string;
  ministryDescription: string;
  educationalBackground: string;
  preferredLanguage: string;
  learningMode: string;
  affirmStatement: boolean;
  signatureFullName: string;
  isReturningStudent: boolean;
  cohortId: string;
}

const calculateAge = (day: string, month: string, year: string): number | null => {
  if (!day || !month || !year) return null;
  const dob = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age > 0 ? age : null;
};

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptingApplications, setAcceptingApplications] = useState<boolean | null>(null);
  const [cohorts, setCohorts] = useState<{ id: string; name: string; is_active: boolean; start_date?: string | null; end_date?: string | null }[]>([]);
  const [activeCohortId, setActiveCohortId] = useState<string>("");

  useEffect(() => {
    const checkAdmissions = async () => {
      try {
        const { data } = await supabase.from('system_settings').select('value').eq('key', 'accepting_applications').single();
        if (data) {
          const val = data.value;
          setAcceptingApplications(val === true || val === 'true');
        } else {
          setAcceptingApplications(true);
        }
      } catch {
        setAcceptingApplications(true);
      }
    };
    checkAdmissions();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cohorts")
        .select("id, name, is_active, start_date, end_date")
        .order("start_date", { ascending: false });
      const list = data || [];
      setCohorts(list);
      const active = list.find((c) => c.is_active);
      if (active) {
        setActiveCohortId(active.id);
        setForm((prev) => ({ ...prev, cohortId: prev.cohortId || active.id }));
      }
    })();
  }, []);

  const STORAGE_KEY = "slsom_register_draft";

  const [form, setForm] = useState<FormData>(() => {
    const defaults: FormData = {
      firstName: "", lastName: "", middleName: "", email: "",
      password: "", confirmPassword: "", phone: "", passportPhoto: null, photoUrl: "",
      gender: "", dobDay: "", dobMonth: "", dobYear: "",
      maritalStatus: "", address: "", isBornAgain: "",
      hasDiscoveredMinistry: "", ministryDescription: "",
      educationalBackground: "", preferredLanguage: "", learningMode: "",
      affirmStatement: false, signatureFullName: "",
      isReturningStudent: false, cohortId: "",
    };
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // never restore passwords or file blobs
        return { ...defaults, ...parsed, password: "", confirmPassword: "", passportPhoto: null };
      }
    } catch { /* ignore */ }
    return defaults;
  });

  // Persist form (excluding sensitive/non-serializable fields) on change
  useEffect(() => {
    try {
      const { password: _p, confirmPassword: _c, passportPhoto: _f, ...safe } = form;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch { /* ignore quota */ }
  }, [form]);

  const updateForm = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const MAX_BYTES = 500 * 1024;
      if (file.size > MAX_BYTES) {
        toast.error(`Passport photo must be 500KB or smaller. Selected file is ${(file.size / 1024).toFixed(0)}KB.`);
        e.target.value = "";
        return;
      }
      updateForm("passportPhoto", file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const validateStep1 = () => {
    if (!form.firstName.trim()) return "First name is required";
    if (!form.lastName.trim()) return "Last name is required";
    if (!form.email.trim()) return "Email is required";
    if (!form.password) return "Password is required";
    if (form.password.length < 6) return "Password must be at least 6 characters";
    if (form.password !== form.confirmPassword) return "Passwords do not match";
    if (!form.phone.trim()) return "Phone number is required";
    // Passport photo is optional — users can add it later from their profile.
    // If a URL is provided, do a basic sanity check.
    if (form.photoUrl && !/^https?:\/\//i.test(form.photoUrl.trim())) {
      return "Photo URL must start with http:// or https://";
    }
    return null;
  };

  const validateStep3 = () => {
    if (!form.learningMode) return "Please select a learning mode";
    if (!form.affirmStatement) return "You must affirm the statement of intent";
    if (!form.signatureFullName.trim()) return "Signature is required";
    return null;
  };

  const handleNext = () => setStep((s) => Math.min(s + 1, 3));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));
  const goToStep = (n: number) => setStep(Math.max(1, Math.min(3, n)));

  const handleSubmit = async () => {
    const err1 = validateStep1();
    if (err1) { toast.error(err1); setStep(1); return; }
    const err3 = validateStep3();
    if (err3) { toast.error(err3); setStep(3); return; }

    setLoading(true);
    try {
      const age = calculateAge(form.dobDay, form.dobMonth, form.dobYear);

      // ONLY supabase.auth.signUp — the DB trigger creates profiles + students rows
      console.log("[Register] Starting signup for:", form.email);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: [form.firstName, form.middleName, form.lastName]
              .filter((n) => n.trim().length > 0)
              .join(" "),
            first_name: form.firstName,
            last_name: form.lastName,
            middle_name: form.middleName,
            phone: form.phone,
            gender: form.gender || null,
            age: age ?? null,
            cohort_id: form.cohortId || activeCohortId || null,
          },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered") || authError.message.includes("already been registered")) {
          throw new Error("An account with this email already exists. Please log in instead.");
        }
        // The form was open when the page loaded, but applications closed since:
        // the database now refuses the account (lib/signup-closed.ts).
        if (isSignupRefusal(authError.message)) {
          setAcceptingApplications(false);
          throw new Error("Registrations have just closed, so we couldn't create your account.");
        }
        throw authError;
      }
      if (!authData.user) throw new Error("Registration failed. Please try again.");

      const userId = authData.user.id;
      console.log("[Register] Auth user created:", userId);

      // Wait for the DB trigger to create the student record, with retry
      let studentExists = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const { data: check } = await supabase
          .from('students')
          .select('id')
          .eq('profile_id', userId)
          .maybeSingle();
        if (check) {
          studentExists = true;
          break;
        }
      }

      if (!studentExists) {
        console.error('[Register] Student record not created by trigger after retries');
      }

      // Use selected cohort (or active cohort fallback)
      const chosenCohortId = form.cohortId || activeCohortId || null;

      // Update student record with all registration fields
      const dob = form.dobDay && form.dobMonth && form.dobYear
        ? `${form.dobYear}-${form.dobMonth.padStart(2, '0')}-${form.dobDay.padStart(2, '0')}`
        : null;

      const studentUpdate: TablesUpdate<'students'> = {
        learning_mode: form.learningMode || null,
        marital_status: form.maritalStatus || null,
        address: form.address || null,
        is_born_again: form.isBornAgain === 'yes',
        has_discovered_ministry: form.hasDiscoveredMinistry === 'yes',
        ministry_description: form.ministryDescription || null,
        educational_background: form.educationalBackground || null,
        preferred_language: form.preferredLanguage || null,
        date_of_birth: dob,
        ...(chosenCohortId ? { cohort_id: chosenCohortId } : {}),
      };

      const { error: studentUpdateError } = await supabase
        .from('students')
        .update(studentUpdate)
        .eq('profile_id', userId);

      if (studentUpdateError) {
        console.error('[Register] Student update failed:', studentUpdateError.message);
      }

      // Save passport photo to R2 (non-blocking — doesn't fail registration).
      // Priority: uploaded File > pasted URL. If neither, user can add it from profile later.
      try {
        if (form.passportPhoto) {
          const fileExt = form.passportPhoto.name.split(".").pop();
          const fileName = `avatars/${userId}.${fileExt}`;
          await r2Storage.uploadFile(form.passportPhoto, fileName);
          const publicUrl = r2Storage.getPublicUrl(fileName);
          await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
        } else if (form.photoUrl.trim()) {
          await supabase.from("profiles").update({ avatar_url: form.photoUrl.trim() }).eq("id", userId);
        }
      } catch (photoErr) {
        console.warn("[Register] Photo save failed (non-critical):", photoErr);
      }

      toast.success("Registration successful! Redirecting to your dashboard...");
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      await new Promise(resolve => setTimeout(resolve, 1500));
      navigate("/student/dashboard", { replace: true });
    } catch (error) {
      console.error("[Register] REGISTRATION FAILED:", error.message);
      toast.error(error.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (acceptingApplications === null) {
    return (
      <div role="status" className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Checking whether applications are open…</span>
      </div>
    );
  }

  if (acceptingApplications === false) {
    return (
      <>
        <SEO title="Apply for Admission | SLSOM" description="Apply to Spirit Life School of Ministry — register for free physical or online ministry training in Ibadan, Nigeria." path="/register" />
        <ApplyClosed />
      </>
    );
  }

  // Everything but the password, the photo file and the auto-filled cohort is
  // kept in localStorage as the applicant types (see the effect above).
  const hasDraft =
    [
      form.firstName, form.lastName, form.middleName, form.email, form.phone, form.photoUrl,
      form.gender, form.dobDay, form.dobMonth, form.dobYear, form.maritalStatus, form.address,
      form.isBornAgain, form.hasDiscoveredMinistry, form.ministryDescription,
      form.educationalBackground, form.preferredLanguage, form.learningMode, form.signatureFullName,
    ].some((v) => v.trim().length > 0) || form.affirmStatement || form.isReturningStudent;

  const currentYear = new Date().getFullYear();
  const activeCohortName = cohorts.find((c) => c.id === activeCohortId)?.name;

  const leading =
    step > 1 ? (
      <button type="button" onClick={handleBack} aria-label="Previous step" className={iconButtonClass}>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
    ) : (
      <Link to="/" aria-label="Back to home" className={iconButtonClass}>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </Link>
    );

  const status = (
    <span aria-live="polite" className="min-h-5">
      {hasDraft && (
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          Saved<span className="sr-only"> on this device</span>
        </span>
      )}
    </span>
  );

  return (
    <>
      <SEO title="Apply for Admission | SLSOM" description="Apply to Spirit Life School of Ministry — register for free physical or online ministry training in Ibadan, Nigeria." path="/register" />
      <ApplyFrame
        className="min-h-[calc(100dvh-4rem)] sm:min-h-0"
        leading={leading}
        status={status}
        progress={<StepIndicator currentStep={step} steps={STEPS} onStepClick={goToStep} />}
        titleId="apply-step-title"
        title={STEP_TITLES[step - 1]}
        description={STEP_INTROS[step - 1]}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) handleNext();
          else void handleSubmit();
        }}
        // Leaves room on phones for the floating WhatsApp bubble, which sits
        // over the bottom-right corner of every public page.
        footerClassName="pr-[88px] sm:pr-8"
        footer={
          <>
            {step > 1 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={loading} className={backButtonClass}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={loading} className={continueButtonClass}>
              {step < 3 ? (
                <>Continue <ArrowRight className="h-5 w-5" aria-hidden="true" /></>
              ) : loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Submitting…</>
              ) : (
                "Submit application"
              )}
            </Button>
          </>
        }
        after={
          <p className="m-0 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Log in
            </Link>
          </p>
        }
      >
        {/* Step 1 */}
        {step === 1 && (
          <>
            <GoogleAuthButton label="Sign up with Google" />
            <div className="relative" role="separator" aria-label="or">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 font-semibold tracking-wider text-muted-foreground">or use your email</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" htmlFor="firstName">
                <Input id="firstName" name="firstName" autoComplete="given-name" aria-required="true" value={form.firstName} onChange={(e) => updateForm("firstName", e.target.value)} placeholder="John" className={fieldClass} />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <Input id="lastName" name="lastName" autoComplete="family-name" aria-required="true" value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} placeholder="Doe" className={fieldClass} />
              </Field>
            </div>
            <Field label={<>Middle name<Optional /></>} htmlFor="middleName">
              <Input id="middleName" name="middleName" autoComplete="additional-name" value={form.middleName} onChange={(e) => updateForm("middleName", e.target.value)} className={fieldClass} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" name="email" inputMode="email" autoComplete="email" aria-required="true" value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="you@example.com" className={fieldClass} />
            </Field>
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 sm:gap-3">
              <Field label="Password" htmlFor="password" hint="At least 6 characters." hintId="password-hint">
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-required="true"
                    aria-describedby="password-hint"
                    value={form.password}
                    onChange={(e) => updateForm("password", e.target.value)}
                    className={`${fieldClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className={eyeButtonClass}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password" htmlFor="confirmPassword">
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-required="true"
                    value={form.confirmPassword}
                    onChange={(e) => updateForm("confirmPassword", e.target.value)}
                    className={`${fieldClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    aria-pressed={showConfirmPassword}
                    className={eyeButtonClass}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
              </Field>
            </div>
            <Field label="WhatsApp number" htmlFor="phone" hint="We send your admission update here." hintId="phone-hint">
              <Input id="phone" type="tel" name="phone" inputMode="tel" autoComplete="tel" aria-required="true" aria-describedby="phone-hint" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="+234 …" className={fieldClass} />
            </Field>
            <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <legend className="mb-1.5 text-sm font-semibold text-foreground">
                Passport photo<Optional />
              </legend>
              <div className="flex items-center gap-4">
                {photoPreview || form.photoUrl ? (
                  <img
                    src={photoPreview || form.photoUrl}
                    alt="Your passport photo"
                    className="h-20 w-20 shrink-0 rounded-[14px] border-2 border-primary/20 object-cover"
                    onError={() => { /* invalid URL — ignore preview */ }}
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[14px] border-2 border-dashed border-input bg-muted">
                    <Camera className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="inline-flex h-11 cursor-pointer items-center gap-2 self-start rounded-xl border border-input bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    {photoPreview ? "Change photo" : "Upload photo"}
                    <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
                  </label>
                  <span className="text-[13px] text-muted-foreground">Any image, 500KB or smaller.</span>
                </div>
              </div>
              <Field
                label={<span className="text-[13px] font-medium text-muted-foreground">Or paste an image URL</span>}
                htmlFor="photo-url"
                hint="You can also skip this and add a photo later from your profile."
                hintId="photo-url-hint"
              >
                <Input
                  id="photo-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/photo.jpg"
                  aria-describedby="photo-url-hint"
                  value={form.photoUrl}
                  onChange={(e) => updateForm("photoUrl", e.target.value)}
                  className={fieldClass}
                />
              </Field>
            </fieldset>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <ChoiceGroup
              legend="Gender"
              name="gender"
              value={form.gender}
              onChange={(v) => updateForm("gender", v)}
              options={[{ value: "Female", label: "Female" }, { value: "Male", label: "Male" }]}
            />
            <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
              <legend className="mb-1.5 text-sm font-semibold text-foreground">Date of birth</legend>
              <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
                <NativeSelect aria-label="Day" value={form.dobDay} onChange={(e) => updateForm("dobDay", e.target.value)}>
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>{d}</option>
                  ))}
                </NativeSelect>
                <NativeSelect aria-label="Month" value={form.dobMonth} onChange={(e) => updateForm("dobMonth", e.target.value)}>
                  <option value="" disabled>Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1)}>{m}</option>
                  ))}
                </NativeSelect>
                <NativeSelect aria-label="Year" value={form.dobYear} onChange={(e) => updateForm("dobYear", e.target.value)}>
                  <option value="" disabled>Year</option>
                  {Array.from({ length: currentYear - 1940 + 1 }, (_, i) => currentYear - i).map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </NativeSelect>
              </div>
            </fieldset>
            <Field label="Marital status" htmlFor="maritalStatus">
              <NativeSelect id="maritalStatus" value={form.maritalStatus} onChange={(e) => updateForm("maritalStatus", e.target.value)}>
                <option value="" disabled>Select status</option>
                {["Single", "Married", "Divorced", "Widowed"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Address" htmlFor="address">
              <Textarea id="address" name="address" autoComplete="street-address" value={form.address} onChange={(e) => updateForm("address", e.target.value)} rows={2} className={textareaClass} />
            </Field>
            <ChoiceGroup
              legend="Are you born again?"
              name="isBornAgain"
              value={form.isBornAgain}
              onChange={(v) => updateForm("isBornAgain", v)}
              options={YES_NO}
            />
            <ChoiceGroup
              legend="Have you discovered your ministry?"
              name="hasDiscoveredMinistry"
              value={form.hasDiscoveredMinistry}
              onChange={(v) => updateForm("hasDiscoveredMinistry", v)}
              options={YES_NO}
            />
            {form.hasDiscoveredMinistry === "yes" && (
              <Field label="Describe your ministry" htmlFor="ministryDesc">
                <Input id="ministryDesc" value={form.ministryDescription} onChange={(e) => updateForm("ministryDescription", e.target.value)} className={fieldClass} />
              </Field>
            )}
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <>
            <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
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
                  selected={form.learningMode === m.value}
                  onSelect={() => updateForm("learningMode", m.value)}
                />
              ))}
            </fieldset>

            <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-muted/40 p-4">
              <Field label="Cohort" htmlFor={form.isReturningStudent ? "cohort" : undefined}>
                {form.isReturningStudent ? (
                  <NativeSelect id="cohort" aria-required="true" value={form.cohortId} onChange={(e) => updateForm("cohortId", e.target.value)}>
                    <option value="" disabled>Select your cohort</option>
                    {cohorts.map((c) => {
                      const yearRange = c.start_date && c.end_date
                        ? `${new Date(c.start_date).getFullYear()}/${new Date(c.end_date).getFullYear().toString().slice(-2)}`
                        : null;
                      const tag = c.is_active ? "(Current)" : `(Past${yearRange ? ` - ${yearRange}` : ""})`;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} {tag}
                        </option>
                      );
                    })}
                  </NativeSelect>
                ) : (
                  <div className="flex min-h-12 flex-wrap items-center gap-x-2 rounded-xl border border-input bg-card px-3 py-2 text-[15px] font-medium text-foreground">
                    {activeCohortName || "Loading active cohort..."}
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">Current intake</span>
                  </div>
                )}
              </Field>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="returningStudent"
                  checked={form.isReturningStudent}
                  onCheckedChange={(v) => {
                    const isReturning = !!v;
                    updateForm("isReturningStudent", isReturning);
                    // Reset to active cohort if unchecked
                    if (!isReturning) updateForm("cohortId", activeCohortId);
                  }}
                  className="mt-0.5 h-5 w-5"
                />
                <Label htmlFor="returningStudent" className="cursor-pointer text-sm font-normal leading-relaxed">
                  I am a <strong>returning / past student</strong> registering for an earlier cohort
                </Label>
              </div>
            </div>

            <ChoiceGroup
              legend="Preferred language of instruction"
              name="preferredLanguage"
              value={form.preferredLanguage}
              onChange={(v) => updateForm("preferredLanguage", v)}
              options={[{ value: "English", label: "English" }, { value: "Yoruba", label: "Yoruba" }]}
            />
            <Field label="Educational background" htmlFor="eduBg">
              <Textarea id="eduBg" value={form.educationalBackground} onChange={(e) => updateForm("educationalBackground", e.target.value)} rows={3} placeholder="List institutions, dates, and qualifications..." className={textareaClass} />
            </Field>

            <section aria-labelledby="intent-title" className="flex flex-col gap-3 rounded-[14px] border border-border bg-secondary/40 p-4">
              <h2 id="intent-title" className="m-0 text-[15px] font-bold text-foreground">Statement of intent</h2>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="affirm"
                  checked={form.affirmStatement}
                  onCheckedChange={(v) => updateForm("affirmStatement", !!v)}
                  aria-required="true"
                  className="mt-0.5 h-5 w-5"
                />
                <Label htmlFor="affirm" className="cursor-pointer text-sm font-normal leading-relaxed text-muted-foreground">
                  I affirm that I will uphold the doctrine of holiness with regards to spiritual discipline and excellence through modest dressing, paying attention to what is taught, engaging in practical exercises, morals, regular class attendance, and general Christian conduct. I will abide by the Institute's rules and regulations.
                </Label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
                <Field label="Full name (as signature)" htmlFor="signature">
                  <Input id="signature" aria-required="true" autoComplete="name" value={form.signatureFullName} onChange={(e) => updateForm("signatureFullName", e.target.value)} className={`${fieldClass} italic`} />
                </Field>
                <Field label="Date of signing" htmlFor="signedOn">
                  <Input id="signedOn" value={format(new Date(), "PPP")} disabled className={`${fieldClass} bg-muted disabled:opacity-80`} />
                </Field>
              </div>
            </section>
          </>
        )}
      </ApplyFrame>
    </>
  );
};

export default Register;
