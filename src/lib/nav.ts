/** Portal navigation helpers shared by the student and admin shells. */

/** `/admin` renders the dashboard, so treat it as the dashboard path. */
const ALIASES: Record<string, string> = {
  "/admin": "/admin/dashboard",
};

export const normalizePortalPath = (pathname: string) =>
  ALIASES[pathname] ?? pathname;

/** True when `path` covers `pathname` — the path itself or anything under it. */
const covers = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

/**
 * Whether a sidebar item should read as active for the current location.
 *
 * Prefix-based, so detail routes keep their parent lit: /admin/students/:id
 * highlights Students, /student/exams/:id/lobby highlights Exams. `allPaths`
 * breaks ties — when a longer nav path also covers the location, only that
 * more specific item is active.
 */
export const isNavActive = (pathname: string, path: string, allPaths: string[]) => {
  const current = normalizePortalPath(pathname);
  if (!covers(current, path)) return false;
  return !allPaths.some((other) => other.length > path.length && covers(current, other));
};
