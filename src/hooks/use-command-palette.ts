import { useEffect, useState } from "react";

/**
 * Owns the palette's open state and the ⌘K / Ctrl+K shortcut, so a layout only
 * has to render <CommandPaletteTrigger/> and the palette itself.
 */
export const useCommandPalette = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
};
