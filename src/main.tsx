import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { isChunkLoadError, recoverFromStaleBuild } from "./lib/chunk-recovery";
import "./index.css";
import posthog from 'posthog-js';

// Initialize PostHog if API key is provided
if (import.meta.env.VITE_POSTHOG_KEY && import.meta.env.VITE_POSTHOG_KEY !== 'your_posthog_api_key_here') {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: 'https://app.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
  });
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
