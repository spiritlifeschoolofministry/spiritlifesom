## Goal

Ship four feature batches in one pass, plus fix the Fees tab bugs you reported.

---

## 1. Fees tab — bug fixes & enhancements

**Bugs**
- Receipt "View" does nothing on the Fee Manager tab — the receipt `<Dialog>` is rendered only inside the Payment Approvals branch. Move it out so both pending and approved receipts open from any tab.
- Receipt resolution falls through silently when `storage_provider` is missing. Pass `storage_provider: 'r2'` as the default-guess fallback and surface a toast when nothing resolves, so we stop seeing "nothing happens".

**New features**
- **Delete any payment record** — admin trash button on every row in both Pending and Approved tables (with confirm dialog, audit log preserved via existing trigger).
- **Filter approved payments** by: student name search, cohort dropdown, fee type, and date range. State lives next to the approved list; results count shown.
- Approved list also gets sortable headers (date / amount / student).

---

## 2. Profile-completion stepper (replaces `CompleteProfile.tsx`)

Convert the single form into a 3-step stepper using the existing `StepIndicator`:
- **Step 1 — Name** (first / middle / last) — only shown if missing
- **Step 2 — Contact** (phone)
- **Step 3 — Student details** (gender, age, learning mode)

Each step:
- skipped automatically when the underlying fields are already filled (Google often pre-fills name)
- zod validation per step, inline errors, `Next` disabled until valid
- final submit shows loading spinner, success toast, error toast, and a submit-in-flight guard (`useRef` + `disabled`) to prevent double-submit
- progress = filled-required-fields / total-required-fields, shown above the stepper

---

## 3. Admin / teacher override

- `ProtectedRoute` already exempts admin/teacher from the completion guard — keep that.
- On **Admin → Student Profile page**, add a "Mark profile complete" button (admins only). It writes sentinel values (`profile.phone='N/A'` if blank, `student.gender='Unspecified'`, `student.age=0` → store `-1` to mean "admin-overridden", `learning_mode='Physical'` default) **OR** — cleaner — flip a new boolean `students.profile_complete_override`. I'll go with the boolean override since it's reversible and doesn't pollute real data.
- Button shows current state and lets admin toggle off.

---

## 4. Server-side RLS lockout until profile complete

**Schema**
- Add `students.profile_complete_override boolean default false`.
- Create SQL helper `public.is_profile_complete(_user uuid)` (SECURITY DEFINER, STABLE) returning true when either the override is set OR all required fields are filled. Mirrors the TS `isStudentProfileComplete` logic.

**Policies tightened** — for student-role users only (admin/teacher always allowed via existing `get_my_role()` checks):
Add `AND public.is_profile_complete(auth.uid())` to the existing student SELECT policies on:
- `fees`, `payments`, `assignments`, `assignment_submissions`, `course_materials`, `attendance`, `exams`, `exam_attempts`, `grades`-related tables, `announcements`, `school_events`, `notifications`.

`profiles` and `students` themselves stay readable (otherwise CompleteProfile can't load). `cohorts` stays readable (home page needs it).

Result: even if a student bypasses the frontend guard, every dashboard query returns empty/denied until they finish onboarding.

**Frontend** — also update `isStudentProfileComplete()` to honor the new override flag.

---

## Technical notes

- All DB changes go through one migration (column + function + altered policies).
- Existing seeded students have all fields filled, so the new policies won't lock anyone out retroactively (verified by spec of `handle_new_user` + registration flow).
- No edge functions needed.
- No new packages.

## Files touched

- `src/pages/admin/Fees.tsx` — move receipt dialog out, add delete + filters
- `src/lib/receipt-url.ts` — fallback hardening + clearer null returns
- `src/pages/CompleteProfile.tsx` — rewritten as stepper
- `src/lib/profile-complete.ts` — honor override flag, expose `missingFields()` helper for progress
- `src/pages/admin/StudentProfile.tsx` — add override toggle button
- `src/components/ProtectedRoute.tsx` — no change needed (admins already exempt)
- New migration — column, helper function, policy updates
