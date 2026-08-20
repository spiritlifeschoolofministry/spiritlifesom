import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Lock, Search, User } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { preloadPath } from "@/routes/lazy-pages";

export interface PaletteItem {
  label: string;
  icon: LucideIcon;
  path: string;
  /** Listed but not navigable, with the same reason the sidebar gives. */
  disabled?: boolean;
}

export interface PaletteGroup {
  id: string;
  title: string | null;
  items: PaletteItem[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: PaletteGroup[];
  /** Adds "jump to a student by name" — admin only. */
  searchStudents?: boolean;
  /** Shown in place of a group heading for the ungrouped items. */
  fallbackGroupTitle?: string;
}

interface StudentHit {
  id: string;
  name: string;
  email: string | null;
}

/**
 * ⌘K / Ctrl+K jump-to-anywhere. Faster than any menu once someone knows the
 * portal, and in admin it also resolves a student name straight to their page.
 */
const CommandPalette = ({
  open,
  onOpenChange,
  groups,
  searchStudents = false,
  fallbackGroupTitle = "Go to",
}: CommandPaletteProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<StudentHit[]>([]);

  // Clear the query between openings so the palette always starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setStudents([]);
    }
  }, [open]);

  // Student lookup is a server query, so wait until the term is worth a trip.
  useEffect(() => {
    if (!searchStudents || !open) return;
    const term = query.trim();
    if (term.length < 2) {
      setStudents([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, profile:profiles!inner(first_name, last_name, email)")
        .eq("is_staff_preview", false)
        .or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
          { referencedTable: "profiles" }
        )
        .limit(6);

      if (cancelled || error || !data) return;
      setStudents(
        data.map((row) => {
          const profile = row.profile as { first_name?: string; last_name?: string; email?: string } | null;
          return {
            id: row.id,
            name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unnamed student",
            email: profile?.email ?? null,
          };
        })
      );
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchStudents, open]);

  const go = useCallback(
    (path: string) => {
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange]
  );

  const renderedGroups = useMemo(
    () => groups.filter((group) => group.items.length > 0),
    [groups]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={searchStudents ? "Search pages or students..." : "Search pages..."}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {renderedGroups.map((group) => (
          <CommandGroup key={group.id} heading={group.title ?? fallbackGroupTitle}>
            {group.items.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.path}`}
                disabled={item.disabled}
                onSelect={() => go(item.path)}
                onMouseEnter={() => preloadPath(item.path)}
              >
                {item.disabled ? (
                  <Lock className="mr-2 h-4 w-4" />
                ) : (
                  <item.icon className="mr-2 h-4 w-4" />
                )}
                <span>{item.label}</span>
                {item.disabled && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    After admission
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {students.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Students">
              {students.map((student) => (
                <CommandItem
                  key={student.id}
                  value={`student-${student.id}-${student.name}`}
                  onSelect={() => go(`/admin/students/${student.id}`)}
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>{student.name}</span>
                  {student.email && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {student.email}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};

/** Header button that opens the palette — the discoverable half of ⌘K. */
export const CommandPaletteTrigger = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Search pages"
    className="hidden md:flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  >
    <Search className="h-3.5 w-3.5" />
    <span>Search</span>
    <kbd className="rounded border border-border bg-muted px-1 font-sans text-[10px]">⌘K</kbd>
  </button>
);

export default CommandPalette;
