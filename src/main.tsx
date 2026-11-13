import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { isChunkLoadError, recoverFromStaleBuild } from "./lib/chunk-recovery";
import { redirectRefusedOAuthSignup } from "./lib/signup-closed";
import "./index.css";

// PostHog is ~160 KB gzipped. Importing it statically put it in the entry
// chunk, so every visitor downloaded it before the first paint. Load it once
// the page has loaded and the browser is idle; it records the current page as
// its first pageview when it initialises, so nothing is lost.
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
if (posthogKey && posthogKey !== "your_posthog_api_key_here") {
  const startPosthog = () =>
    import("posthog-js")
      .then(({ default: posthog }) =>
        posthog.init(posthogKey, {
          api_host: "https://app.posthog.com",
          capture_pageview: true,
          capture_pageleave: true,
        }),
      )
      .catch(() => {
        // Analytics is optional; a blocked or failed load must not break the app.
      });
  const whenIdle = () =>
    "requestIdleCallback" in window
      ? window.requestIdleCallback(startPosthog, { timeout: 5000 })
      : setTimeout(startPosthog, 2000);
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}

// Suppress console output in production to prevent information leakage
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.debug = noop;
  // console.error is intentionally kept for critical runtime errors
}

// A chunk load can also fail outside React's render — a nav link warming the
// next page's chunk on hover, for instance. Those rejections never reach the
// error boundary, but they mean the same thing: this tab's build is gone.
window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event.reason)) recoverFromStaleBuild();
});

// Before the router: the dashboard's guard would drop the error in the URL.
redirectRefusedOAuthSignup();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </AppErrorBoundary>,
);

requestAnimationFrame(() => {
  // React clears #root as it mounts, which takes the pre-hydration shell in
  // index.html with it. Belt and braces in case a future React ever stops
  // doing that — a leftover shell would sit under the real UI.
  document.getElementById("boot-shell")?.remove();
  // The inline background index.html paints before the stylesheet arrives has
  // done its job. Leave it and it outranks the stylesheet, so the page would
  // keep the boot theme's background when someone flips the theme toggle.
  document.documentElement.style.removeProperty("background-color");
  document.documentElement.style.removeProperty("color-scheme");
});
