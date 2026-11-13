import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { hasWebGL, type CardDetails } from "@/lib/certificate-card";

// three.js and React Three Fiber load only when this renders, so neither the
// certificate page nor the verify page carries them in its own chunk.
const Certificate3D = lazy(() => import("./Certificate3D"));

/** If WebGL fails mid-way, show nothing rather than break the page. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const LazyCertificate3D = ({ details, className }: { details: CardDetails; className?: string }) => {
  const [supported] = useState(hasWebGL);
  // Pages pass a fresh object each render; textures should only be repainted
  // when one of the four details actually changes.
  const { name, cohort, serial, dateText } = details;
  const stable = useMemo(() => ({ name, cohort, serial, dateText }), [name, cohort, serial, dateText]);
  if (!supported) return null;
  return (
    <Quiet>
      <Suspense fallback={<div className={className ?? "h-64 w-full sm:h-80"} aria-hidden="true" />}>
        <Certificate3D details={stable} className={className} />
      </Suspense>
    </Quiet>
  );
};

export default LazyCertificate3D;
