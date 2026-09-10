import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { isChunkLoadError, recoverFromStaleBuild } from "@/lib/chunk-recovery";

describe("isChunkLoadError", () => {
  it("recognises the browsers' dynamic-import failures", () => {
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true);
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    const named = new Error("Loading chunk 4 failed");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);
  });

  it("leaves ordinary application errors alone", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("recoverFromStaleBuild", () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reloads once to pick up the current build", () => {
    expect(recoverFromStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("refuses a second reload so a broken build cannot loop", () => {
    recoverFromStaleBuild();
    expect(recoverFromStaleBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows another attempt once the cooldown has passed", () => {
    recoverFromStaleBuild();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    expect(recoverFromStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
