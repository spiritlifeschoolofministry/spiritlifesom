import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MissingProfileField } from "@/lib/profile-complete";

/**
 * Fake PostgREST-ish client over in-memory tables.
 *
 * The behaviour that matters here: an UPDATE matching zero rows resolves with
 * `error: null`, exactly like the real API. That's what made a missing profile
 * row look like a successful save.
 */
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { profiles: [], students: [], cohorts: [] };
const writes: Array<{ table: string; op: string; payload: Row | null; matched: number }> = [];

const makeBuilder = (table: string) => {
  const filters: Array<[string, unknown]> = [];
  let op: "select" | "update" | "insert" = "select";
  let payload: Row | null = null;

  const matching = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));

  const exec = () => {
    if (op === "insert") {
      const row = { id: `${table}-${db[table].length + 1}`, ...(payload as Row) };
      db[table].push(row);
      writes.push({ table, op, payload, matched: 1 });
      return { data: [row], error: null };
    }
    if (op === "update") {
      const hits = matching();
      hits.forEach((r) => Object.assign(r, payload));
      // Zero matches is NOT an error — the crux of the bug.
      writes.push({ table, op, payload, matched: hits.length });
      return { data: hits, error: null };
    }
    return { data: matching(), error: null };
  };

  const builder = {
    select: () => builder,
    update: (p: Row) => { op = "update"; payload = p; return builder; },
    insert: (p: Row) => { op = "insert"; payload = p; return builder; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return builder; },
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => {
      const { data, error } = exec();
      return Promise.resolve({ data: data[0] ?? null, error });
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(exec()).then(res, rej),
  };
  return builder;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

const { saveProfileCompletion } = await import("@/lib/complete-profile-save");

const ALL_MISSING: MissingProfileField[] = ["first_name", "last_name", "phone", "gender", "age", "learning_mode"];

const INPUT = {
  userId: "user-1",
  email: "grace@example.com",
  firstName: "Grace",
  middleName: "",
  lastName: "Adeyemi",
  phone: "+2348012345678",
  gender: "Female",
  age: 27,
  learningMode: "Online",
  missing: ALL_MISSING,
};

const input = (over: Partial<typeof INPUT> = {}) => ({ ...INPUT, ...over });

beforeEach(() => {
  db.profiles = [];
  db.students = [];
  db.cohorts = [{ id: "cohort-active", is_active: true, created_at: "2026-01-01" }];
  writes.length = 0;
});

describe("saveProfileCompletion", () => {
  it("creates both rows when the signup trigger never made them", async () => {
    await expect(saveProfileCompletion(input())).resolves.toBeUndefined();

    expect(db.profiles).toHaveLength(1);
    expect(db.profiles[0]).toMatchObject({
      id: "user-1",
      email: "grace@example.com",
      role: "student",
      first_name: "Grace",
      last_name: "Adeyemi",
      phone: "+2348012345678",
    });

    expect(db.students).toHaveLength(1);
    expect(db.students[0]).toMatchObject({
      profile_id: "user-1",
      gender: "Female",
      age: 27,
      learning_mode: "Online",
      // A self-created row must not arrive pre-approved.
      admission_status: "Pending",
      is_approved: false,
      cohort_id: "cohort-active",
    });
  });

  it("updates existing rows without touching role", async () => {
    db.profiles.push({ id: "user-1", email: "grace@example.com", role: "admin", first_name: null, last_name: null, phone: null });
    db.students.push({ id: "s-1", profile_id: "user-1", gender: null, age: null, learning_mode: null, admission_status: "Admitted", is_approved: true });

    await saveProfileCompletion(input());

    expect(db.profiles).toHaveLength(1);
    // An admin filling in missing fields stays an admin, and stays admitted.
    expect(db.profiles[0].role).toBe("admin");
    expect(db.students[0]).toMatchObject({ admission_status: "Admitted", is_approved: true, gender: "Female" });
    expect(writes.some((w) => w.op === "insert")).toBe(false);
  });

  it("creates only the row that is missing", async () => {
    db.profiles.push({ id: "user-1", email: "grace@example.com", role: "student", first_name: "Grace", last_name: "Adeyemi", phone: "+2348012345678" });

    await saveProfileCompletion(input({ missing: ["gender", "age", "learning_mode"] }));

    expect(writes.filter((w) => w.op === "insert").map((w) => w.table)).toEqual(["students"]);
    expect(db.profiles).toHaveLength(1);
  });

  it("rejects instead of reporting success when the write does not land", async () => {
    // Row exists but the update silently affects nothing (e.g. RLS filtered it),
    // so the record is still incomplete afterwards.
    db.profiles.push({ id: "user-1", email: "grace@example.com", role: "student", first_name: "Grace", last_name: "Adeyemi", phone: "+2348012345678" });
    db.students.push({ id: "s-1", profile_id: "user-1", gender: null, age: null, learning_mode: null });

    await expect(
      saveProfileCompletion(input({ missing: [] })),
    ).rejects.toThrow(/still looks incomplete/);
  });

  it("leaves cohort_id null when no cohort is active", async () => {
    db.cohorts = [];

    await saveProfileCompletion(input());

    expect(db.students[0].cohort_id).toBeNull();
  });
});
