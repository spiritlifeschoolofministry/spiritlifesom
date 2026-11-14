# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Node.js 22 (required: Vite 8 and Vitest 5 do not run on Node 20; see `.nvmrc`)
- Vite 8 (Rolldown bundler) and Vitest 5
- TypeScript
- React 19 with React Router 7
- Zod 4 for form validation
- shadcn-ui
- Tailwind CSS
- three.js with React Three Fiber (3D graphics), plus the animation, chart and 2D libraries listed below

## 3D graphics (three.js)

three.js is installed and ready to use, along with React Three Fiber and drei:

| Package | Version | Purpose |
| --- | --- | --- |
| `three` | ^0.187 | The 3D engine |
| `@types/three` | ^0.187 | TypeScript types (dev) |
| `@react-three/fiber` | ^9.8 | Write three.js scenes as React components |
| `@react-three/drei` | ^10.7 | Helpers: camera controls, loaders, text, environments |

Fiber 9 and drei 10 require React 19. Don't downgrade React without moving them back to fiber 8 / drei 9.

Minimal example:

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export default function Scene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 4] }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 2, 2]} />
      <mesh>
        <boxGeometry />
        <meshStandardMaterial color="hotpink" />
      </mesh>
      <OrbitControls />
    </Canvas>
  );
}
```

Guidelines:

- Load 3D pages with `React.lazy` so three.js (~150 KB gzipped) stays out of the main bundle.
- Use small, compressed glTF models (Draco). Put them in `public/`, or in R2 if they are large.
- Cap the pixel ratio (`dpr={[1, 2]}`) so the Android app runs well on low-end phones.

`src/components/three/SceneCanvas.tsx` wraps all of this: `<SceneCanvas><mesh>…</mesh></SceneCanvas>` gives you a canvas with lighting, capped pixel ratio and orbit controls. Put model files in `public/models/` and load them with drei's `useGLTF("/models/name.glb")`.

### 3D certificate card

`src/components/three/Certificate3D.tsx` shows a certificate card that turns over from its gold seal to its face, then sways and tilts toward the pointer. It appears on the student Certificate page once the certificate is issued, and on the public Verify page for a genuine (not revoked) certificate. The details come from the page: name, session, graduation date and serial.

- **Plain three.js, not React Three Fiber.** It uses named imports, so the bundle keeps only what the scene uses: about 132 KB gzipped against 243 KB with Fiber. It lives in its own chunk.
- **Lazy and safe.** `LazyCertificate3D.tsx` loads it with `React.lazy` only when WebGL is available (`hasWebGL()` in `src/lib/certificate-card.ts`). An error boundary hides it if WebGL fails mid-way.
- **Cheap to run.** It renders only while on screen (IntersectionObserver), holds a still angle under reduced motion, and caps the pixel ratio at 2.
- **Accessible.** The canvas is `aria-hidden`; the same details are on the page as text. The card text layout is tested in `src/test/certificate-card.test.ts`.

### Certificate layout editor

Superadmins can move the elements of a cohort's certificate: **Admin › Settings › Certificates › Edit** (a cohort) **› Edit layout**. Drag the logo/school name, title, "certify" line, recipient name, student code, rule, main text, sub text, date, serial/verify line and each signatory block; they snap to the sheet's centre lines. For keyboard use, pick an element from the list and move it with the arrow keys (Shift = 10px), or type its position, size and (for text blocks) width. **Reset to default** puts everything back; **Save layout** stores it for that cohort.

- **Where it is stored.** `cohort_certificate_settings.layout` (jsonb, nullable), added by `supabase/migrations/20261114090000_certificate_layout.sql`. The existing policies apply unchanged: staff and the cohort's own students read it, only superadmins (the `admin` role) write it.
- **Shape.** An object keyed by element (`header`, `title`, `certify`, `recipientName`, `studentCode`, `rule`, `mainText`, `subText`, `date`, `serial`, `signatory1`, `signatory2`), each `{ x, y, fontScale?, width? }`. `x`/`y` are the element's anchor point as fractions 0–1 of the A4-landscape sheet (top centre for most, top-left for the header, bottom-left/bottom-right for the signatories). `fontScale` multiplies the type size; `width` is a wrapping block's width as a fraction of the sheet. Missing elements keep their default place; the student code and sub text follow the name and main text until they are moved. Only changed elements are saved, and a layout with no changes saves as `null`.
- **Where it is used.** `CertificateArtwork` takes a `layout` prop. With `null` it draws the original fixed certificate, unchanged; with a layout it places each element by it. The student Certificate page (screen, Print, PDF/PNG export) and the admin preview both load and pass it.
- **Code.** `src/lib/certificate-layout.ts` (type, defaults, `parseCertificateLayout`, `serialiseCertificateLayout`, geometry helpers; tested in `src/test/certificate-layout.test.ts`), `src/components/admin/CertificateLayoutEditor.tsx` (react-konva, loaded with `React.lazy` so konva stays out of every other chunk). `src/test/certificate-artwork.test.tsx` checks that a certificate with no layout renders exactly as before.

## Graphics, charts and animation libraries

Import the heavy ones only from pages loaded with `React.lazy`, or with a dynamic `import()`, so they stay out of the main bundle.

| Area | Package | Version | Where it is used |
| --- | --- | --- | --- |
| Animation | `framer-motion` | ^14.13 | Page transitions in the portals (see "Portal navigation"); list changes planned |
| Animation | `gsap` + `@gsap/react` | ^3.15 / ^2.1 | Installed and kept for future animations; nothing uses it yet (the home page uses CSS and `Reveal`). |
| Charts | `recharts` | ^3.10 | Dashboard charts (admin Analytics) |
| Charts | `d3` (+ `@types/d3`, dev) | ^7.9 | Cohort funnel scale (admin Analytics) |
| 2D | `konva` + `react-konva` | ^10.9 / ^19.3 | Certificate layout editor (see "Certificate layout editor"), in its own lazy chunk |
| 3D | `three` (+ `@react-three/fiber`, `@react-three/drei` for `SceneCanvas`) | see "3D graphics" | 3D certificate card (see "3D graphics") |

Removed in November 2026 because nothing used them and other packages already cover them: Babylon.js (`@babylonjs/core`, `@babylonjs/loaders`, `babylonjs-gltf2interface`), PixiJS (`pixi.js`, `@pixi/react`), `animejs`, and Chart.js (`chart.js`, `react-chartjs-2`).

Version constraints (the app is on React 19):

- **react-konva 19, fiber 9 and drei 10 all require React 19.**
- **React 19 brought these upgrades:** `next-themes` 0.4, `vaul` 1.1 and `react-day-picker` 9. `src/components/ui/calendar.tsx` uses day-picker 9's class names and `Chevron` component; pass `autoFocus`, not the removed `initialFocus`.
- **Recharts 3** no longer puts `payload` and `label` on `Tooltip`'s props, and pie `label` callbacks get the data row under `payload`. `src/components/ui/chart.tsx` is already adapted.

## Visual design

The portal follows the redesign canvas ("SLSOM Redesign" artifact). Colours are CSS variables in `src/index.css` (`:root` and `.dark`):

- **Base colours:** ink `#17112B` for text, ground `#F9F8FC`, primary purple `#5B21B6` (dark mode: a lighter purple with white text).
- **Softer tones:** soft lavender for secondary surfaces and hovers, a muted grey for secondary text, and a 0.875rem radius.
- **Sidebars:** both portal sidebars use `.gradient-purple`, now a deep plum.
- **Standout colour:** `.gradient-flame` is now the primary purple with white text, the same as "Apply now" (it was gold until November 2026, and the class name is kept). It's used for the active nav item and the main call to action. Every other gold on the site (buttons, badges, the staff-preview banner, count badges, the "gold" tone in `redesign/student-pages/ui.tsx` and `TodayTimetable`) is now that purple too; gold text on dark panels became a light tint of it (`#C4B5FD`). Two things keep gold on purpose: the printed certificate artwork (its seal and ribbon, in `src/components/certificate/` and the 3D card) and amber status colours (warnings, "Pending", "Late", "Missed"), which carry meaning.

## Redesigned screens

Built to the boards on the "SLSOM Redesign" canvas; the home page follows Option A of the "SLSOM Homepage Options" canvas (see "Home page"). Shared pieces live under `src/components/redesign/`:

- **Public** (`public/`): every public page except `/` uses the white header (Home, About, Courses, Faculty, Contact, Verify, Log in, Apply now) and footer from `PublicLayout`; `/` draws its own (see "Home page"). The page list, social links and WhatsApp number are shared from `public-links.ts`. Login, Forgot and Reset password share the card style in `auth.tsx`.
- **Apply** (`apply/`): Register and Complete profile use one frame (back button, thin progress bar, "Step n of m", pinned Back/Continue footer). It also has the admissions-closed screen.
- **Student**:
  - `student/`: the More sheet, the application tracker for pending students, and Today's timetable (`useTodayPlan`).
  - `student-pages/`: shared cards and status pills, and the exam Start/Resume/Enter rules (`exam-paper.ts`, tested).
- **Admin** (`admin/`): layout primitives, and the receipt queue used by Fees and Payments. The Admissions page is a review queue with bulk approve and J/K/A/M/R shortcuts. Rejecting a receipt keeps the student's own note and adds "Rejected: reason" after it (`src/lib/rejection-note.ts`).

## Fee adjustments, waivers and other recent additions

- **Adjust or waive a student's fee** (Admin › Money › Fees and payments › Student fee records): **Adjust** sets the amount due, and **Waive** / **Undo waiver** takes a reason. Both go through admin-only database functions `admin_set_fee_due` and `admin_set_fee_waived`, added in migration `20261114100000_admin_fee_adjust_waive.sql`. They recompute Paid, Partial or Unpaid, refuse an amount due below what has been paid, and are recorded by the existing audit trigger on `fees`. Teachers can't change money.
- **Today on admin Home** (`src/components/admin/AdminToday.tsx`): today's classes, exam windows and school events, each linking to Attendance, the exam monitor or the Calendar. Hidden on an empty day.
- **Session progress on My Courses**: courses still running show "held / planned sessions" from the schedule.
- **Contact subject**: the Contact form has an optional Subject field. `send-contact-email` accepts it (one line, at most 120 characters), puts it in the email subject, and now HTML-escapes every visitor field.
- **Phone fixes**: the WhatsApp button sits above the pinned step footer on `/register` and `/complete-profile`. Switches have an invisible 48 × 44 px tap area.

## Portal navigation

- **Student portal** (`src/components/StudentLayout.tsx`): sections are Dashboard, Learn (courses, materials, tasks, study), Exams, My Record (attendance, assessments, transcript, certificate, fees), Community and Account. On phones the bottom bar has one tab per section (Dashboard, Learn, Exams, Record, More), and the pages of the current section sit in a tab strip above the content. URLs are unchanged. The sidebar (and the phone menu drawer) runs the full height of the screen with one button pinned at the bottom: "Switch to admin" for staff, "Sign out" for students.
- **Make-up window for one student** (`src/pages/admin/exams/ExamMonitor.tsx`, "Did not sit this paper"): click a name to set that student's own opening and closing time for the paper (stored in `exam_window_overrides`). Nobody else's window changes. Both times are saved because exam-start counts the late-entry cutoff from the student's opening time; an override with only a closing time would still refuse them with "Entry closed" on a paper that has a cutoff.
- **Student exams** (`src/pages/student/exams/ExamsList.tsx`): papers that share a window (same start and end) are grouped under one heading with "x of n done", live windows first. While a window is open the heading compares the time left with the time the unsubmitted papers need. Grouping logic: `src/lib/exam-windows.ts` (tested in `src/test/exam-windows.test.ts`).
- **Admin portal** (`src/components/AdminLayout.tsx`): sections are People, Teaching (courses, attendance, tasks, practice questions, materials, calendar), Exams, Money, Reach (announcements, email history), Insights and System.
- **Admin dashboard, "Needs your attention"**: besides admissions, receipts and requests it now counts unverified check-ins, exam attempts submitted but not yet graded, and WhatsApp chats handed to a person and still open.
- **Student dashboard layout**: on a computer, "what to do" (Up next, today's timetable, tasks due) sits beside a narrow record column. When there is nothing to do, that first column hides and the record (tiles four across, Barnabas' summary, Ask Barnabas) takes the full width instead of leaving the narrow column blank.
- **Up next on the dashboard** (`src/components/student/UpNext.tsx`): the first card on the student dashboard. An open exam window wins (papers done, time left versus time needed), then the soonest window in the next 14 days, then the next class that counts for attendance (with a Check in link on the day). It renders nothing when none of those exist.
- **Page transitions** (`src/components/motion/PageTransition.tsx`): pages inside the student and admin shells fade and lift in on navigation (Framer Motion, `LazyMotion` + `domAnimation`, only in the portal chunks). No exit animation, because lazy pages behind Suspense would flash blank. Off when the device asks for reduced motion.
- **Attendance heatmap** (admin Attendance, `src/components/charts/AttendanceHeatmap.tsx`): students × the last 20 classes that count, lowest attendance first, following the statistics' cohort filter. Cells: present (blue), late (amber), checked in but not verified (hatched), absent (dark orange), excused (lilac); colours differ in lightness, not hue alone. Data shaping in `src/lib/attendance-heatmap.ts` (tested). The verification queue's rows slide out when verified or declined.
- **Cohort funnel** (admin Analytics, Records tab, `src/components/charts/CohortFunnel.tsx`): Applied → Admitted (admitted + graduates) → Graduated, with conversion, using a d3 scale for bar widths. Counting in `src/lib/cohort-funnel.ts` (tested).
- **Barnabas' page map** (`src/lib/portal-map.ts`) uses the same section names, so "where is…" answers match the sidebar.

## Home page

`src/pages/Home.tsx`, laid out phone first and adapting at the `md` (tablet) and `lg` (desktop) breakpoints. It links to the other public pages but never repeats their content.

- **Top bar** (sticky, dark ink): logo, Log in and a Menu button that opens a bottom sheet with About, Courses, Faculty, Contact, Verify a certificate, and Log in / Register side by side. Log in is an outlined button so it stands apart from the page links. On desktop the links and a purple Register button sit in the bar instead.
- **Hero** (`src/components/home/HeroCarousel.tsx`): full-screen photos (the screen height under the top bar) that cross-fade every 4 seconds, with the school's purple wash, a dark fade from the bottom and a slow zoom on the current photo. On top, bottom left: "Welcome to Spirit Life School of Ministry", the headline (any "saints" in it is picked out in light purple italic), the scripture reference, and the buttons: "Ask about the next intake" (WhatsApp) while admissions are closed, "Apply now" while they are open (`system_settings.accepting_applications`), and "See the courses". Dots sit bottom right on phones and bottom centre from tablet up (clear of the WhatsApp button). Swipe sideways on a phone to change photo. The slideshow waits for the first photo, pauses while something in it has keyboard focus or the tab is hidden, and doesn't advance for people who ask for reduced motion. Only the first photo is in the page at first (it is the largest paint); the next one joins once it has loaded (tested in `src/test/home-hero.test.tsx`).
- **All wording is editable** in Admin › Settings › Site content › `home`, and every row there is used by the page (nothing else is left in that tab): `hero_welcome`, `hero_headline`, `hero_reference`, `intake_button` and `intake_message` (the WhatsApp button while admissions are closed), `study_title`, `physical_points` and `online_points` (one item per line; the editor shows any row with line breaks as a multi-line box), `journey_title`, `step1_title` … `step3_desc`, `footer_text`, and `fees_note`. Migrations `20261115090000_home_hero_headline.sql` and `20261116090000_home_site_content_cleanup.sql` (which also deleted the ten old home rows the redesigned page no longer showed) set this up. `src/test/home-content.test.tsx` checks that each of these keys really drives the page. Navigation labels (About, Courses, Register, Student portal, See the courses) are fixed, like the rest of the site's menus.
- **Four big actions**: Ask about the next intake, See the courses, Register, Student portal.
- **How you can study**: a Physical / Online switch with the price and what is included (see "Fees on the home page"), next to the three joining steps (Site content `journey_title`, `step1_title` … `step3_desc`). Sections fade up as they scroll in (`Reveal`).
- **Footer**: copyright and social links only.
- **Phones only**: a purple "Ask about the next intake" (or "Apply now") button pinned to the bottom, which slides in once the hero has scrolled away. The floating WhatsApp button is hidden there on phones, and the back-to-top button sits above the bar.
- **Colour**: buttons use the same purple as "Apply now" on the other public pages (`bg-primary`); purple text on the dark bar and photos uses a light tint of it (`#C4B5FD`), since the button purple is too dark to read there. No gold on the home page (or anywhere else now; see "Visual design").
- **Font**: headings use Fraunces from `@fontsource/fraunces` (^5.3, self-hosted, only the Latin 500, 700 and 500-italic files, imported by `Home.tsx`), available as Tailwind's `font-display`.

## Fees on the home page

The "How you can study" card on `/` shows what the programme costs. Physical is always "Free". The Online price comes from one of two sources:

1. **An admin's note.** Admin › Settings › Site content › `home` › "Fees line on the home page". Whatever is written there is shown as is under Online (for example "₦50,000, payable in two instalments").
2. **Live fees**, when that note is empty. The `public_fee_summary()` database function returns the fee structures of the active cohort (the one Register uses): fee name, amount and learning modes, and nothing about any student. The page totals the Online fees (counting `All`) and shows that total with the cohort, for example "₦30,000 school fees, 2026/2027". Studying in person is free, and Physical-only rows are course handouts, not school fees. `summarisePublicFees` also returns a one-line text ("₦30,000 online · free for physical students", or "Free for physical students" with no Online fees) and `onlineTotal`. Hybrid is assigned by admins, so it isn't quoted.

`fee_structures` itself stays closed to visitors. The function is the only public way in. It ships in `supabase/migrations/20261113100000_public_fee_summary.sql`, which also adds the empty site-content row. If neither source has anything, Online shows "school fees" without a price. The logic is in `src/lib/public-fees.ts` (tested in `src/test/public-fees.test.ts`) and `src/hooks/use-public-fees.ts`.

## Dependency notes

- **Vendor chunks use Rolldown `codeSplitting.groups`.** Vite 8 builds with Rolldown, which rejects Rollup's object-form `manualChunks`. `vite.config.ts` turns the `VENDOR_CHUNKS` table into groups under `build.rolldownOptions.output.codeSplitting`, and earlier entries get higher priority. The priorities matter: a group also takes the dependencies of the modules it captures, so without them `vendor-radix` swallowed React. React Router 7's code lives in `react-router`, not `react-router-dom`, so both are listed under `vendor-react`.
- **Zod 4 error messages** use `{ error: "..." }`. The Zod 3 options `errorMap`, `invalid_type_error` and `required_error` no longer exist.
- **`overrides` in `package.json`** force patched versions of `minimatch`, `glob` and `postcss-selector-parser`, which typescript-eslint, workbox and Tailwind typography would otherwise pull in at vulnerable versions.
- **PostHog loads after first paint.** `src/main.tsx` imports `posthog-js` dynamically once the page has loaded and the browser is idle, keeping ~160 KB gzipped out of the entry chunk. Don't import it statically.
- **Known, accepted:** `deepmerge` (low severity, used by `vite-plugin-pwa` at build time only) has no patched release yet.

## Keeping this README current

Each new feature or dependency gets documented here in the same change that adds it.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
