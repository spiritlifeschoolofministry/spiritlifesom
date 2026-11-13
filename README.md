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

No feature uses 3D yet. Add each 3D feature to this section when you build it.

## Graphics, charts and animation libraries

Import the heavy ones only from pages loaded with `React.lazy`, or with a dynamic `import()`, so they stay out of the main bundle.

| Area | Package | Version | Where it is used |
| --- | --- | --- | --- |
| Animation | `framer-motion` | ^14.13 | App UI motion (page transitions, list changes). Planned. |
| Animation | `gsap` + `@gsap/react` | ^3.15 / ^2.1 | Home page scroll effects. Planned (homepage redesign, on the `homepage-redesign` branch). |
| Charts | `recharts` | ^3.10 | Dashboard charts (admin Analytics) |
| Charts | `d3` (+ `@types/d3`, dev) | ^7.9 | Custom visualisations (attendance heatmap, cohort funnel). Planned. |
| 2D | `konva` + `react-konva` | ^10.9 / ^19.3 | Canvas editing (certificate layout editor). Planned; needs a place to store positions. |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` | see "3D graphics" | 3D certificate. Planned. |

Removed in November 2026 because nothing used them and other packages already cover them: Babylon.js (`@babylonjs/core`, `@babylonjs/loaders`, `babylonjs-gltf2interface`), PixiJS (`pixi.js`, `@pixi/react`), `animejs`, and Chart.js (`chart.js`, `react-chartjs-2`).

Version constraints (the app is on React 19):

- **react-konva 19, fiber 9 and drei 10 all require React 19.**
- **React 19 brought these upgrades:** `next-themes` 0.4, `vaul` 1.1 and `react-day-picker` 9. `src/components/ui/calendar.tsx` uses day-picker 9's class names and `Chevron` component; pass `autoFocus`, not the removed `initialFocus`.
- **Recharts 3** no longer puts `payload` and `label` on `Tooltip`'s props, and pie `label` callbacks get the data row under `payload`. `src/components/ui/chart.tsx` is already adapted.

## Portal navigation

- **Student portal** (`src/components/StudentLayout.tsx`): sections are Today (the dashboard), Learn (courses, materials, tasks, study), Exams, My Record (attendance, assessments, transcript, certificate, fees), Community and Account. On phones the bottom bar has one tab per section (Today, Learn, Exams, Record, More), and the pages of the current section sit in a tab strip above the content. URLs are unchanged.
- **Student exams** (`src/pages/student/exams/ExamsList.tsx`): papers that share a window (same start and end) are grouped under one heading with "x of n done", live windows first. While a window is open the heading compares the time left with the time the unsubmitted papers need. Grouping logic: `src/lib/exam-windows.ts` (tested in `src/test/exam-windows.test.ts`).
- **Admin portal** (`src/components/AdminLayout.tsx`): sections are People, Teaching (courses, attendance, tasks, practice questions, materials, calendar), Exams, Money, Reach (announcements, email history), Insights and System.
- **Admin dashboard, "Needs your attention"**: besides admissions, receipts and requests it now counts unverified check-ins, exam attempts submitted but not yet graded, and WhatsApp chats handed to a person and still open.
- **Barnabas' page map** (`src/lib/portal-map.ts`) uses the same section names, so "where is…" answers match the sidebar.

## Fees on the home page

The "Begin Your Ministry Journey" section on `/` shows what the programme costs, from one of two sources:

1. **An admin's note.** Admin › Settings › Site content › `home` › "Fees line on the home page". Whatever is written there is shown as is (for example "₦50,000, payable in two instalments").
2. **Live fees**, when that note is empty. The `public_fee_summary()` database function returns the fee structures of the active cohort (the one Register uses): fee name, amount and learning modes, and nothing about any student. The page totals them per learning mode, counting `All` for both, so it quotes what a new Physical or Online student is billed. Hybrid is assigned by admins, so it isn't quoted.

`fee_structures` itself stays closed to visitors. The function is the only public way in. It ships in `supabase/migrations/20261113100000_public_fee_summary.sql`, which also adds the empty site-content row. If neither source has anything, the line is hidden. The logic is in `src/lib/public-fees.ts` (tested in `src/test/public-fees.test.ts`) and `src/hooks/use-public-fees.ts`.

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
