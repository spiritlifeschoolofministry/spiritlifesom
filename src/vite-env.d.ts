/// <reference types="vite/client" />

interface Window {
  /** Safari still only exposes the prefixed constructor. */
  webkitAudioContext?: typeof AudioContext;
}
