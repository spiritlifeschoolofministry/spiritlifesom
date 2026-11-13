import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";

/**
 * Fades and lifts a page in when the route changes, inside the student and
 * admin shells. Deliberately no exit animation: pages are lazy-loaded behind
 * Suspense, and waiting for the old page to leave would show a blank frame.
 *
 * `reducedMotion="user"` turns it off for anyone whose device asks for less
 * motion; LazyMotion + `m` keeps the bundle to the DOM animation features.
 */
const PageTransition = ({ routeKey, children }: { routeKey: string; children: ReactNode }) => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
      <m.div
        key={routeKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {children}
      </m.div>
    </MotionConfig>
  </LazyMotion>
);

export default PageTransition;
