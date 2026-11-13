import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Lock, MessageCircle, Moon, MoreHorizontal, Sparkles, Sun, UserCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAiFeature, useAssistantName } from "@/lib/ai-flags";
import { preloadPath } from "@/routes/lazy-pages";

export interface MoreItem {
  label: string;
  icon: LucideIcon;
  path: string;
  /** Locked while admission is pending. */
  locked: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The bottom-bar tab is current: the page shown lives under More. */
  active: boolean;
  community: MoreItem[];
  fullName: string;
  initials: string;
  avatarUrl: string | null;
  /** "STU-0012 · Physical": whatever of the two is on file. */
  subtitle: string;
  whatsappOn: boolean | null;
  isStaff: boolean;
  onSignOut: () => void;
}

const ROW =
  "flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const RowIcon = ({ icon: Icon }: { icon: LucideIcon }) => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-primary">
    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
  </span>
);

const Note = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground/80">{children}</span>
);

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-1.5">
    <h3 className="ml-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</h3>
    <ul className="overflow-hidden rounded-[18px] border border-border bg-card [&>li+li]:border-t [&>li+li]:border-border/60">
      {children}
    </ul>
  </section>
);

/** Same switch as the header's ThemeToggle: the class on <html> plus localStorage. */
const useTheme = () => {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private mode: the switch still applies for this visit.
    }
    setDark(next);
  };
  return { dark, toggle };
};

/** The sheet's body. Mounted only while the sheet is open. */
const MoreBody = ({ close, ...p }: Omit<Props, "open" | "onOpenChange" | "active"> & { close: () => void }) => {
  const chatOn = useAiFeature("ai_chat");
  const assistantName = useAssistantName();
  const theme = useTheme();

  const link = (to: string, label: string, icon: LucideIcon, note?: ReactNode) => (
    <li key={label}>
      <Link to={to} onClick={close} onMouseEnter={() => preloadPath(to)} onFocus={() => preloadPath(to)} className={ROW}>
        <RowIcon icon={icon} />
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {note}
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/student/profile"
        onClick={close}
        className="flex items-center gap-3.5 rounded-[18px] border border-border bg-card p-3.5 text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar className="h-[52px] w-[52px]">
          {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
          <AvatarFallback className="bg-primary text-lg font-extrabold text-primary-foreground">{p.initials}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong className="truncate text-base">{p.fullName || "Student"}</strong>
          {p.subtitle && <span className="truncate text-[13px] text-muted-foreground">{p.subtitle}</span>}
        </span>
        <ChevronRight className="h-5 w-5 text-primary" aria-hidden="true" />
      </Link>

      <Group title="Community">
        {p.community.map((item) =>
          item.locked ? (
            <li key={item.path}>
              <span className={`${ROW} cursor-not-allowed text-muted-foreground hover:bg-transparent`} aria-disabled="true">
                <RowIcon icon={Lock} />
                <span className="flex-1 text-[15px] font-medium">{item.label}</span>
                <Note>After admission</Note>
              </span>
            </li>
          ) : (
            link(item.path, item.label, item.icon)
          ),
        )}
      </Group>

      <Group title="Account">
        {link("/student/profile", "Profile and learning mode", UserCircle)}
        {link(
          "/student/profile",
          "WhatsApp updates",
          MessageCircle,
          p.whatsappOn == null ? undefined : <Note>{p.whatsappOn ? "On" : "Off"}</Note>,
        )}
        {chatOn && link("/student/dashboard?ask=1", `Ask ${assistantName}`, Sparkles)}
        <li>
          <button type="button" onClick={theme.toggle} className={ROW} aria-label={`Appearance: ${theme.dark ? "dark" : "light"}. Switch to ${theme.dark ? "light" : "dark"}`}>
            <RowIcon icon={theme.dark ? Sun : Moon} />
            <span className="flex-1 text-[15px] font-medium">Appearance</span>
            <Note>{theme.dark ? "Dark" : "Light"}</Note>
          </button>
        </li>
      </Group>

      {p.isStaff && (
        <Link
          to="/admin"
          onClick={close}
          className="flex min-h-12 items-center justify-center rounded-[14px] border-[1.5px] border-primary bg-card text-[15px] font-bold text-secondary-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to admin portal (staff only)
        </Link>
      )}
      <button
        type="button"
        onClick={() => {
          close();
          p.onSignOut();
        }}
        className="min-h-12 rounded-[14px] border-[1.5px] border-red-200 bg-card text-[15px] font-bold text-red-800 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        Sign out
      </button>
    </div>
  );
};

/**
 * The bottom bar's More tab and the sheet it opens: profile on top, then the
 * Community and Account pages, staff's way back to admin, and sign out. The
 * Learn, Exams and Record pages are reached from their own tabs.
 */
const MoreSheet = ({ open, onOpenChange, active, ...rest }: Props) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetTrigger asChild>
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[52px] min-w-16 flex-col items-center justify-center gap-[3px] rounded-xl text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active || open ? "font-bold text-secondary-foreground" : "font-medium text-muted-foreground"
        }`}
      >
        <span
          className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${active || open ? "bg-secondary" : ""}`}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </span>
        More
      </button>
    </SheetTrigger>
    <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-[22px] bg-background px-5 pb-safe pt-6">
      <SheetTitle className="sr-only">More</SheetTitle>
      <SheetDescription className="sr-only">Community, account and sign out</SheetDescription>
      <div className="pb-4 pt-4">
        <MoreBody {...rest} close={() => onOpenChange(false)} />
      </div>
    </SheetContent>
  </Sheet>
);

export default MoreSheet;
