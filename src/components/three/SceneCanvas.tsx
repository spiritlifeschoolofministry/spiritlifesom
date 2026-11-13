import { Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

type SceneCanvasProps = {
  children: ReactNode;
  /** Camera start position. */
  cameraPosition?: [number, number, number];
  /** Let the user orbit, zoom and pan with mouse or touch. */
  controls?: boolean;
  className?: string;
};

/**
 * A three.js canvas with sensible defaults for this app: pixel ratio capped at
 * 2 for low-end Android phones, soft lighting, and optional orbit controls.
 *
 * Import it from a page loaded with React.lazy so three.js stays out of the
 * main bundle. Put model files in public/models/.
 */
export default function SceneCanvas({
  children,
  cameraPosition = [0, 0, 4],
  controls = true,
  className,
}: SceneCanvasProps) {
  return (
    <div className={className ?? "h-80 w-full"}>
      <Canvas dpr={[1, 2]} camera={{ position: cameraPosition }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} />
        <Suspense fallback={null}>{children}</Suspense>
        {controls && <OrbitControls makeDefault />}
      </Canvas>
    </div>
  );
}
