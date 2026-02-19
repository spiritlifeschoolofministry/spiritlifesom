import { useState } from "react";
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
import { ArrowLeft, ArrowRight, Loader2, Upload } from "lucide-react";
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
}

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    middleName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    passportPhoto: null,
    gender: "",
    dobDay: "",
    dobMonth: "",
    dobYear: "",
    maritalStatus: "",
    address: "",
    isBornAgain: "",
    hasDiscoveredMinistry: "",
    ministryDescription: "",
    educationalBackground: "",
    preferredLanguage: "",
    learningMode: "",
    affirmStatement: false,
    signatureFullName: "",
  });

  const updateForm = (field: keyof FormData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    if (!form.passportPhoto) return "Passport photo is required";
    return null;
  };

  const validateStep3 = () => {
    if (!form.learningMode) return "Please select a learning mode";
    if (!form.affirmStatement) return "You must affirm the statement of intent";
    if (!form.signatureFullName.trim()) return "Signature is required";
    return null;
  };

  const handleNext = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) { toast.error(err); return; }
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    const err = validateStep3();
    if (err) { toast.error(err); return; }

    setLoading(true);
    try {
      // 1. Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            first_name: form.firstName,
            last_name: form.lastName,
            role: "student",
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Registration failed");

      toast.success("Registration successful!");
      await new Promise(resolve => setTimeout(resolve, 2000));
      navigate("/student/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 py-12 sm:py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">Student Registration</h1>
        <p className="text-sm text-muted-foreground mt-1">Join Spirit Life School of Ministry</p>
      </div>
      <div className="w-full max-w-2xl">
        <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] border border-border p-6 sm:p-10">

          <StepIndicator currentStep={step} steps={STEPS} />

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input id="firstName" value={form.firstName} onChange={(e) => updateForm("firstName", e.target.value)} placeholder="John" />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} placeholder="Doe" />
                </div>
              </div>
              <div>
                <Label htmlFor="middleName">Middle Name</Label>
                <Input id="middleName" value={form.middleName} onChange={(e) => updateForm("middleName", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="password">Password *</Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => updateForm("password", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password *</Label>
                  <Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={(e) => updateForm("confirmPassword", e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="+234..." />
              </div>
              <div>
                <Label>Passport Photo *</Label>
                <div className="mt-2 flex items-center gap-4">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-20 h-20 rounded-xl object-cover border-2 border-primary/20" />
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
                <Textarea id="address" value={form.address} onChange={(e) => updateForm("address", e.target.value)} rows={2} />
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
              <Button type="button" onClick={handleNext} className="gradient-flame border-0 text-accent-foreground hover:opacity-90">
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading} className="gradient-flame border-0 text-accent-foreground hover:opacity-90">
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
