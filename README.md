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
- React 18 with React Router 7
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
| `@react-three/fiber` | ^8.18 | Write three.js scenes as React components |
| `@react-three/drei` | ^9.122 | Helpers: camera controls, loaders, text, environments |

**Keep `@react-three/fiber` on v8 and `drei` on v9.** Fiber v9 / drei v10 need React 19, and this app is on React 18.

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

Installed for upcoming features. None of them is imported by the app yet, so they add nothing to the bundle until something uses them. Import heavy ones (Babylon.js, PixiJS, Konva, d3, Chart.js) only from pages loaded with `React.lazy`.

| Area | Package | Version | Use it for |
| --- | --- | --- | --- |
| Animation | `framer-motion` | ^14.13 | UI and page transitions, enter/exit animations |
| Animation | `gsap` + `@gsap/react` | ^3.15 / ^2.1 | Timelines and scroll animation (`useGSAP` hook) |
| Animation | `animejs` | ^4.5 | Small, lightweight one-off animations |
| Charts | `recharts` | ^3.10 | Dashboard charts (admin Analytics uses it) |
| Charts | `chart.js` + `react-chartjs-2` | ^4.6 / ^5.3 | Canvas charts, good for large data sets |
| Charts | `d3` (+ `@types/d3`, dev) | ^7.9 | Custom visualisations |
| 2D | `pixi.js` | ^8.23 | Fast GPU-drawn 2D graphics (use it directly, no React wrapper) |
| 2D | `konva` + `react-konva` | ^10.9 / 18.2.16 | Drawing and editing on a canvas |
| 3D | `@babylonjs/core` + `@babylonjs/loaders` | ^9.36 | Alternative 3D engine; `babylonjs-gltf2interface` is its required peer |

Version constraints (the app is on React 18):

- **`react-konva` is pinned to 18.2.16.** Version 19 requires React 19.
- **`@pixi/react` is not installed.** Version 8 requires React 19, and version 7 only works with PixiJS 7.
- **Recharts 3** no longer puts `payload` and `label` on `Tooltip`'s props, and pie `label` callbacks get the data row under `payload`. `src/components/ui/chart.tsx` is already adapted.

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
