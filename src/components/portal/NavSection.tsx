import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

interface NavSectionProps {
  /** Stable key for remembering the collapsed state. */
  id: string;
  title: string;
  children: React.ReactNode;
}

const storageKey = (id: string) => `slsm.nav.collapsed.${id}`;

const readCollapsed = (id: string) => {
  try {
    return localStorage.getItem(storageKey(id)) === "1";
  } catch {
    // Private-mode / blocked storage — just start expanded.
    return false;
  }
};

/**
 * A labelled, collapsible group of sidebar links. Sections start expanded, so
 * the default view is simply a grouped list; collapsing is there for people who
 * want to hide the parts of the portal they never use.
 */
const NavSection = ({ id, title, children }: NavSectionProps) => {
  const [collapsed, setCollapsed] = useState(false);

  // Read on mount rather than in useState so SSR/first paint stays consistent.
  useEffect(() => setCollapsed(readCollapsed(id)), [id]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey(id), next ? "1" : "0");
      } catch {
        // Ignore — the section still toggles for this session.
      }
      return next;
    });
  }, [id]);

  const contentId = `nav-section-${id}`;

  return (
    <div className="pt-3 first:pt-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/50 transition-colors hover:text-primary-foreground/80"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          aria-hidden="true"
        />
      </button>
      {!collapsed && (
        <div id={contentId} className="mt-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
};

export default NavSection;
