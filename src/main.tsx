import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
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

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
