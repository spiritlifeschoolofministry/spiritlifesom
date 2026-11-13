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
- three.js with React Three Fiber (3D graphics)

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

No feature uses 3D yet. Add each 3D feature to this section when you build it.

## Dependency notes

- **Vendor chunks use Rolldown `codeSplitting.groups`.** Vite 8 builds with Rolldown, which rejects Rollup's object-form `manualChunks`. `vite.config.ts` turns the `VENDOR_CHUNKS` table into groups under `build.rolldownOptions.output.codeSplitting`, and earlier entries get higher priority. The priorities matter: a group also takes the dependencies of the modules it captures, so without them `vendor-radix` swallowed React. React Router 7's code lives in `react-router`, not `react-router-dom`, so both are listed under `vendor-react`.
- **Zod 4 error messages** use `{ error: "..." }`. The Zod 3 options `errorMap`, `invalid_type_error` and `required_error` no longer exist.
- **`overrides` in `package.json`** force patched versions of `minimatch`, `glob` and `postcss-selector-parser`, which typescript-eslint, workbox and Tailwind typography would otherwise pull in at vulnerable versions.
- **Known, accepted:** `deepmerge` (low severity, used by `vite-plugin-pwa` at build time only) has no patched release yet.

## Keeping this README current

Each new feature or dependency gets documented here in the same change that adds it.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
