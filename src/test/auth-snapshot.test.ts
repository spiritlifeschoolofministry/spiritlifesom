import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthSnapshot, readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth-snapshot";

const profile = { id: "u1", first_name: "Ada" } as never;
const student = { id: "s1", profile_id: "u1" } as never;

describe("auth snapshot cache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("round-trips the cached rows for the same user", () => {
    writeAuthSnapshot({ userId: "u1", role: "student", profile, student });
    const snap = readAuthSnapshot("u1");
    expect(snap?.role).toBe("student");
    expect(snap?.profile).toEqual(profile);
    expect(snap?.student).toEqual(student);
  });

  it("never hands one account's rows to another", () => {
    writeAuthSnapshot({ userId: "u1", role: "student", profile, student });
    expect(readAuthSnapshot("u2")).toBeNull();
  });

  it("ignores a snapshot older than the max age", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(eightDaysAgo);
    writeAuthSnapshot({ userId: "u1", role: "student", profile, student });
    vi.restoreAllMocks();
    expect(readAuthSnapshot("u1")).toBeNull();
  });

  it("ignores corrupt storage instead of throwing", () => {
    localStorage.setItem("slsom.auth.snapshot.v1", "{not json");
    expect(readAuthSnapshot("u1")).toBeNull();
  });

  it("clears on sign out", () => {
    writeAuthSnapshot({ userId: "u1", role: "student", profile, student });
    clearAuthSnapshot();
    expect(readAuthSnapshot("u1")).toBeNull();
  });
});
