import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress console output in production to prevent information leakage
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.debug = noop;
  // console.error is intentionally kept for critical runtime errors
}

createRoot(document.getElementById("root")!).render(<App />);
