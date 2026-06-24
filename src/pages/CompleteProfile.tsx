import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import SEO from "@/components/SEO";
import { isStudentProfileComplete } from "@/lib/profile-complete";

const CompleteProfile = () => {
  const navigate = useNavigate();
  const { user, profile, student, role, isLoading } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState<string>("");
  const [learningMode, setLearningMode] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill from existing data (Google often provides names)
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

  // If already complete, send them on
  useEffect(() => {
    if (isLoading) return;
    if (!user) { navigate("/login", { replace: true }); return; }
    if (isStudentProfileComplete(profile, student)) {
      const r = (role || "").toLowerCase();
      navigate(r === "admin" || r === "teacher" ? "/admin/dashboard" : "/student/dashboard", { replace: true });
    }
  }, [isLoading, user, profile, student, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!firstName.trim() || !lastName.trim()) return toast.error("Enter your first and last name");
    if (!phone.trim()) return toast.error("Phone number is required");
    if (!gender) return toast.error("Select your gender");
    const ageNum = parseInt(age, 10);
    if (!ageNum || ageNum < 10 || ageNum > 100) return toast.error("Enter a valid age");
    if (!learningMode) return toast.error("Choose your learning mode");

    setSaving(true);
    try {
      const { error: pErr } = await supabase.from("profiles").update({
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
        phone: phone.trim(),
      }).eq("id", user.id);
      if (pErr) throw pErr;

      // Student row is auto-created by handle_new_user trigger; update it.
      const { error: sErr } = await supabase.from("students").update({
        gender,
        age: ageNum,
        learning_mode: learningMode,
      }).eq("profile_id", user.id);
      if (sErr) throw sErr;

      toast.success("Profile completed!");
      // Hard reload so AuthContext refetches profile + student
      window.location.assign("/student/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save profile";
      toast.error(msg);
      setSaving(false);
    }
  };

  if (isLoading) {
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
        <h1 className="text-2xl font-bold text-primary mb-2">Complete your profile</h1>
        <p className="text-sm text-muted-foreground mb-6">
          We need a few more details before you can access your dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="fn">First name *</Label>
              <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mn">Middle name</Label>
              <Input id="mn" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ln">Last name *</Label>
              <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="phone">Phone *</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." />
          </div>

          <div>
            <Label>Gender *</Label>
            <RadioGroup value={gender} onValueChange={setGender} className="flex gap-6 mt-2">
              <div className="flex items-center gap-2"><RadioGroupItem value="Male" id="g-m" /><Label htmlFor="g-m">Male</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="Female" id="g-f" /><Label htmlFor="g-f">Female</Label></div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="age">Age *</Label>
            <Input id="age" type="number" min={10} max={100} value={age} onChange={(e) => setAge(e.target.value)} />
          </div>

          <div>
            <Label>Learning mode *</Label>
            <Select value={learningMode} onValueChange={setLearningMode}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="How will you attend?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Physical">Physical (in-person)</SelectItem>
                <SelectItem value="Online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={saving} variant="flame" className="w-full h-11 mt-2">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? "Saving..." : "Continue to dashboard"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;
