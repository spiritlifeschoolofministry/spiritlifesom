import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import StepIndicator from "@/components/StepIndicator";
import LearningModeCard from "@/components/LearningModeCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Upload, Lock } from "lucide-react";
import { format } from "date-fns";

import { toast } from "sonner";

const STEPS = ["Account Setup", "Personal Details", "Academic & Preferences"];

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

  const updateForm = (field: keyof FormData, value: any) => {
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

      const studentUpdate: Record<string, any> = {
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

      // Save passport photo (non-blocking — doesn't fail registration).
      // Priority: uploaded File > pasted URL. If neither, user can add it from profile later.
      try {
        if (form.passportPhoto) {
          const fileExt = form.passportPhoto.name.split(".").pop();
          const fileName = `${userId}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(fileName, form.passportPhoto, { upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
            await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", userId);
          }
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
    } catch (error: any) {
      console.error("[Register] REGISTRATION FAILED:", error.message);
      toast.error(error.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (acceptingApplications === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (acceptingApplications === false) {
    return (
      <div className="flex flex-col items-center px-4 py-16 text-center">
        <Lock className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Registrations Are Currently Closed</h1>
        <p className="text-muted-foreground max-w-md">
          We are not accepting new applications at this time. Please check back later or contact the school office for more information.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">Go Back Home</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">Student Registration</h1>
        <p className="text-sm text-muted-foreground mt-1">Join Spirit Life School of Ministry</p>
      </div>
      <div className="w-full max-w-2xl">
        <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] border border-border p-6 sm:p-10">

          <StepIndicator currentStep={step} steps={STEPS} onStepClick={goToStep} />

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input id="firstName" name="firstName" autoComplete="given-name" value={form.firstName} onChange={(e) => updateForm("firstName", e.target.value)} placeholder="John" />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" name="lastName" autoComplete="family-name" value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} placeholder="Doe" />
                </div>
              </div>
              <div>
                <Label htmlFor="middleName">Middle Name</Label>
                <Input id="middleName" name="middleName" autoComplete="additional-name" value={form.middleName} onChange={(e) => updateForm("middleName", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" name="email" autoComplete="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => updateForm("password", e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.confirmPassword}
                      onChange={(e) => updateForm("confirmPassword", e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input id="phone" type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="+234..." />
              </div>
              <div>
                <Label>Passport Photo <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="mt-2 flex items-center gap-4">
                  {photoPreview || form.photoUrl ? (
                    <img
                      src={photoPreview || form.photoUrl}
                      alt="Preview"
                      className="w-20 h-20 rounded-xl object-cover border-2 border-primary/20"
                      onError={() => { /* invalid URL — ignore preview */ }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center border-2 border-dashed border-border">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <span className="text-sm font-medium text-primary hover:underline">
                      {photoPreview ? "Change photo" : "Upload photo"}
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </label>
                </div>
                <div className="mt-3">
                  <Label htmlFor="photo-url" className="text-xs text-muted-foreground">
                    Or paste an image URL
                  </Label>
                  <Input
                    id="photo-url"
                    type="url"
                    placeholder="https://example.com/photo.jpg"
                    value={form.photoUrl}
                    onChange={(e) => updateForm("photoUrl", e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    You can also skip this and add a photo later from your profile.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label>Gender</Label>
                <RadioGroup value={form.gender} onValueChange={(v) => updateForm("gender", v)} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Male" id="male" />
                    <Label htmlFor="male" className="font-normal">Male</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Female" id="female" />
                    <Label htmlFor="female" className="font-normal">Female</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label>Date of Birth</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <Select value={form.dobDay} onValueChange={(v) => updateForm("dobDay", v)}>
                    <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={form.dobMonth} onValueChange={(v) => updateForm("dobMonth", v)}>
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={form.dobYear} onValueChange={(v) => updateForm("dobYear", v)}>
                    <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: new Date().getFullYear() - 1940 + 1 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Marital Status</Label>
                <Select value={form.maritalStatus} onValueChange={(v) => updateForm("maritalStatus", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {["Single", "Married", "Divorced", "Widowed"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" name="address" autoComplete="street-address" value={form.address} onChange={(e) => updateForm("address", e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Are You Born Again?</Label>
                <RadioGroup value={form.isBornAgain} onValueChange={(v) => updateForm("isBornAgain", v)} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id="ba-yes" />
                    <Label htmlFor="ba-yes" className="font-normal">Yes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id="ba-no" />
                    <Label htmlFor="ba-no" className="font-normal">No</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label>Have You Discovered Your Ministry?</Label>
                <RadioGroup value={form.hasDiscoveredMinistry} onValueChange={(v) => updateForm("hasDiscoveredMinistry", v)} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id="dm-yes" />
                    <Label htmlFor="dm-yes" className="font-normal">Yes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id="dm-no" />
                    <Label htmlFor="dm-no" className="font-normal">No</Label>
                  </div>
                </RadioGroup>
              </div>
              {form.hasDiscoveredMinistry === "yes" && (
                <div>
                  <Label htmlFor="ministryDesc">Describe Your Ministry</Label>
                  <Input id="ministryDesc" value={form.ministryDescription} onChange={(e) => updateForm("ministryDescription", e.target.value)} />
                </div>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
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
                    className="mt-1"
                  />
                  <Label htmlFor="returningStudent" className="text-sm font-normal leading-relaxed cursor-pointer">
                    I am a <strong>returning / past student</strong> registering for an earlier cohort
                  </Label>
                </div>

                <div>
                  <Label>Cohort *</Label>
                  {form.isReturningStudent ? (
                    <Select value={form.cohortId} onValueChange={(v) => updateForm("cohortId", v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select your cohort" />
                      </SelectTrigger>
                      <SelectContent>
                        {cohorts.map((c) => {
                          const yearRange = c.start_date && c.end_date
                            ? `${new Date(c.start_date).getFullYear()}/${new Date(c.end_date).getFullYear().toString().slice(-2)}`
                            : null;
                          const tag = c.is_active ? "(Current)" : `(Past${yearRange ? ` - ${yearRange}` : ""})`;
                          return (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} {tag}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-1 px-3 py-2 rounded-md border border-border bg-card text-sm text-muted-foreground">
                      {cohorts.find((c) => c.id === activeCohortId)?.name || "Loading active cohort..."}
                      <span className="ml-2 text-xs text-primary font-medium">(Current active cohort)</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="eduBg">Educational Background</Label>
                <Textarea id="eduBg" value={form.educationalBackground} onChange={(e) => updateForm("educationalBackground", e.target.value)} rows={3} placeholder="List institutions, dates, and qualifications..." />
              </div>
              <div>
                <Label>Preferred Language of Instruction</Label>
                <RadioGroup value={form.preferredLanguage} onValueChange={(v) => updateForm("preferredLanguage", v)} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="English" id="lang-en" />
                    <Label htmlFor="lang-en" className="font-normal">English</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Yoruba" id="lang-yo" />
                    <Label htmlFor="lang-yo" className="font-normal">Yoruba</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label className="mb-3 block">Preferred Mode of Learning *</Label>
                <div className="space-y-3">
                  <LearningModeCard
                    title="Physical Class"
                    description="Attend classes in person at our campus"
                    price="Free"
                    selected={form.learningMode === "Physical"}
                    onSelect={() => updateForm("learningMode", "Physical")}
                  />
                  <LearningModeCard
                    title="Online Class"
                    description="Join classes remotely via Zoom"
                    price="₦30,000"
                    details={[
                      "Includes training materials",
                      "Live Zoom sessions & class recordings",
                      "Must attend physically for project defense and graduation",
                    ]}
                    selected={form.learningMode === "Online"}
                    onSelect={() => updateForm("learningMode", "Online")}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="affirm"
                    checked={form.affirmStatement}
                    onCheckedChange={(v) => updateForm("affirmStatement", !!v)}
                    className="mt-1"
                  />
                  <Label htmlFor="affirm" className="text-sm font-normal leading-relaxed text-muted-foreground cursor-pointer">
                    I affirm that I will uphold the doctrine of holiness with regards to spiritual discipline and excellence through modest dressing, paying attention to what is taught, engaging in practical exercises, morals, regular class attendance, and general Christian conduct. I will abide by the Institute's rules and regulations.
                  </Label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="signature">Full Name (as Signature) *</Label>
                  <Input id="signature" value={form.signatureFullName} onChange={(e) => updateForm("signatureFullName", e.target.value)} />
                </div>
                <div>
                  <Label>Date of Signing</Label>
                  <Input value={format(new Date(), "PPP")} disabled className="mt-0 bg-muted" />
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
            ) : (
              <div />
            )}
            {step < 3 ? (
              <Button type="button" onClick={handleNext} variant="flame">
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading} variant="flame">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Registration
              </Button>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
