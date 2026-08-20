import { describe, it, expect } from "vitest";
import { isNavActive, normalizePortalPath } from "@/lib/nav";

const ADMIN = ["/admin/dashboard", "/admin/students", "/admin/exams", "/admin/fees"];
const STUDENT = ["/student/dashboard", "/student/exams", "/student/grades"];

describe("normalizePortalPath", () => {
  it("treats /admin as the dashboard", () => {
    expect(normalizePortalPath("/admin")).toBe("/admin/dashboard");
  });

  it("leaves other paths alone", () => {
    expect(normalizePortalPath("/admin/students")).toBe("/admin/students");
  });
});

describe("isNavActive", () => {
  it("matches the item's own path", () => {
    expect(isNavActive("/admin/students", "/admin/students", ADMIN)).toBe(true);
  });

  it("keeps the parent lit on a detail route", () => {
    expect(isNavActive("/admin/students/abc-123", "/admin/students", ADMIN)).toBe(true);
    expect(isNavActive("/admin/exams/7/edit", "/admin/exams", ADMIN)).toBe(true);
    expect(isNavActive("/student/exams/7/lobby", "/student/exams", STUDENT)).toBe(true);
  });

  it("lights the dashboard at the bare portal root", () => {
    expect(isNavActive("/admin", "/admin/dashboard", ADMIN)).toBe(true);
  });

  it("does not match unrelated siblings", () => {
    expect(isNavActive("/admin/students", "/admin/exams", ADMIN)).toBe(false);
    expect(isNavActive("/student/grades", "/student/exams", STUDENT)).toBe(false);
  });

  it("does not match on a partial path segment", () => {
    expect(isNavActive("/admin/students-archive", "/admin/students", ADMIN)).toBe(false);
  });

  it("gives a more specific nav path precedence", () => {
    const paths = ["/admin/exams", "/admin/exams/questions"];
    expect(isNavActive("/admin/exams/questions", "/admin/exams/questions", paths)).toBe(true);
    expect(isNavActive("/admin/exams/questions", "/admin/exams", paths)).toBe(false);
  });
});
