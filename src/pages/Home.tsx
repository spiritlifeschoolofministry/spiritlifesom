import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, FilePlus2, LogIn, Menu, MessageCircle } from "lucide-react";
import "@fontsource/fraunces/latin-500.css";
import "@fontsource/fraunces/latin-700.css";
import "@fontsource/fraunces/latin-500-italic.css";
import { supabase } from "@/integrations/supabase/client";
import Reveal from "@/components/Reveal";
import SEO from "@/components/SEO";
import HeroCarousel from "@/components/home/HeroCarousel";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSiteContent } from "@/hooks/use-site-content";
import { usePublicFees } from "@/hooks/use-public-fees";
import { formatNaira } from "@/lib/public-fees";
import { preloadPath } from "@/routes/lazy-pages";
import { cn } from "@/lib/utils";
import { publicNavLinks, socialLinks, whatsappHref } from "@/components/redesign/public/public-links";

/**
 * The home page, phone first. A dark sticky top bar (links in a bottom-sheet
 * menu on phones and tablets, inline on desktop), full-screen photos with the
 * headline and buttons on top, four big actions, how you can study, how to
 * join, and on phones an action bar in the thumb zone once the photos have
 * scrolled away. The other public pages are only linked from here, never
 * repeated. Wording comes from Admin › Settings › Site content › home.
 */

const INTAKE_MESSAGE = "Hello Spirit Life SOM, I'd like to know when the next intake opens.";

/** A Site content row that holds a list, one item per line. */
const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
// The same purple as "Apply now" on the other public pages (bg-primary).
const cta = "bg-primary text-primary-foreground hover:bg-primary/90";
// Purple text on the dark bar and photos: a light tint of the same hue, since
// the button purple itself is too dark to read there.
const accentOnDark = "text-[#C4B5FD]";
const darkRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#17112B]";

/** The headline with "saints" picked out in purple, when the wording has it. */
const Headline = ({ text }: { text: string }) => {
  const parts = text.split(/(saints)/i);
  return (
    <>
      {parts.map((part, i) =>
        /^saints$/i.test(part) ? (
          <em key={i} className={cn("font-medium italic", accentOnDark)}>
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
};

/** Warm a lazy page's chunk on hover / focus / touch, before the click lands. */
const prefetch = (path: string) => ({
  onMouseEnter: () => preloadPath(path),
  onFocus: () => preloadPath(path),
  onTouchStart: () => preloadPath(path),
});

const menuLinks = [
  ...publicNavLinks.filter((l) => l.to !== "/" && l.to !== "/verify"),
  { label: "Verify a certificate", to: "/verify" },
];

const HomeTopBar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-[#17112B] text-white">
      <div className="mx-auto flex h-[60px] max-w-[1200px] items-center gap-2 px-4 md:px-8 lg:h-[72px]">
        <Link to="/" className={cn("mr-auto flex min-w-0 items-center gap-2.5 rounded-lg", darkRing)}>
          <img src="/images/school-logo.png" alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-contain p-0.5" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-display text-[17px] font-bold">Spirit Life SOM</span>
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-[#C4B5FD]">School of Ministry</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          {publicNavLinks
            .filter((l) => l.to !== "/")
            .map((l) => (
              <Link
                key={l.to}
                to={l.to}
                {...prefetch(l.to)}
                className={cn("inline-flex min-h-11 items-center rounded-md text-[15px] font-medium text-white/75 hover:text-white", darkRing)}
              >
                {l.label}
              </Link>
            ))}
        </nav>

        <Link
          to="/login"
          {...prefetch("/login")}
          className={cn("inline-flex min-h-11 items-center rounded-xl border border-white/45 px-4 text-[15px] font-bold text-white transition-colors hover:bg-white/10", darkRing)}
        >
          Log in
        </Link>
        <Link
          to="/register"
          {...prefetch("/register")}
          className={cn("hidden min-h-11 items-center rounded-xl px-5 font-bold lg:inline-flex", cta, darkRing)}
        >
          Register
        </Link>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 text-white hover:bg-white/10 lg:hidden", darkRing)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-4">
            <SheetTitle className="font-display text-xl font-bold">Menu</SheetTitle>
            <SheetDescription className="sr-only">Pages of the Spirit Life School of Ministry website</SheetDescription>
            <nav aria-label="Menu" className="mt-3 flex flex-col">
              {menuLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  {...prefetch(l.to)}
                  onClick={() => setMenuOpen(false)}
                  className={cn("flex min-h-14 items-center border-t border-border px-1 text-[17px] font-semibold", focusRing)}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className={cn("flex min-h-[52px] items-center justify-center rounded-2xl border-[1.5px] border-foreground font-bold", focusRing)}
              >
                Log in
              </Link>
              <Link
                to="/register"
                onClick={() => setMenuOpen(false)}
                className={cn("flex min-h-[52px] items-center justify-center rounded-2xl font-bold", cta, focusRing)}
              >
                Register
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

type Mode = "physical" | "online";

const Home = () => {
  // null until system_settings answers; treated as closed so a closed school
  // never flashes an Apply button.
  const [acceptingApplications, setAcceptingApplications] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("physical");
  const { get } = useSiteContent("home");
  const fees = usePublicFees(get("fees_note", ""));
  const intakeHref = whatsappHref(get("intake_message", INTAKE_MESSAGE));
  const intakeLabel = get("intake_button", "Ask about the next intake");
  const open = acceptingApplications === true;
  // The phone's bottom button repeats the hero's main button, so it only
  // slides in once the hero has scrolled away.
  const heroRef = useRef<HTMLElement | null>(null);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), { threshold: 0 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "accepting_applications")
      .single()
      .then(({ data }) => {
        if (data) setAcceptingApplications(data.value === true || data.value === "true");
      });
  }, []);

  const onlinePrice =
    fees.kind === "live" && fees.onlineTotal ? formatNaira(fees.onlineTotal) : null;
  const modes: Record<Mode, { price: string | null; note: string; points: string[] }> = {
    physical: {
      price: "Free",
      note: "for physical students",
      points: lines(
        get(
          "physical_points",
          "Saturdays, 9AM to 12PM, in Ibadan\nIn-person lectures and practicals\nCourse handouts are sold separately",
        ),
      ),
    },
    online: {
      price: onlinePrice,
      note:
        fees.kind === "note"
          ? fees.text
          : fees.kind === "live" && fees.cohortName
            ? `school fees, ${fees.cohortName}`
            : "school fees",
      points: lines(
        get(
          "online_points",
          "Live Zoom sessions every Saturday\nTraining materials and class recordings included\nAttend in person for project defence and graduation",
        ),
      ),
    },
  };
  const shown = modes[mode];

  const steps = [
    { n: 1, title: get("step1_title", "Apply"), desc: get("step1_desc", "Fill in the registration form online"), dot: "bg-primary text-primary-foreground" },
    { n: 2, title: get("step2_title", "Get Admitted"), desc: get("step2_desc", "Await your admission decision"), dot: "bg-primary/15 text-primary dark:bg-primary/30 dark:text-foreground" },
    { n: 3, title: get("step3_title", "Start Learning"), desc: get("step3_desc", "Begin your transformation"), dot: "bg-foreground text-background" },
  ];

  const quickTile = "flex min-h-[100px] flex-col justify-between gap-3 rounded-[18px] p-4 transition-transform hover:-translate-y-0.5";

  return (
    <div className="bg-background text-foreground">
      <SEO
        title="Spirit Life School of Ministry | SLSOM Official"
        description="A Spirit-led ministry training school in Ibadan, Nigeria, equipping believers for effective Christian ministry through biblical, practical and pastoral training."
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Spirit Life School of Ministry",
          url: "https://spiritlifesom.org/",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://spiritlifesom.org/?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }}
      />

      <HomeTopBar />

      {/* Full-screen photos with the headline on top */}
      <HeroCarousel sectionRef={heroRef}>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 pb-16 md:px-8 md:pb-20 lg:pb-24">
          <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80 md:text-xs">
            <span aria-hidden="true" className="h-px w-6 shrink-0 bg-[#C4B5FD]" />
            {get("hero_welcome", "Welcome to Spirit Life School of Ministry")}
          </p>
          <h1 className="max-w-[15ch] font-display text-[44px] font-medium leading-[1.02] tracking-[-0.02em] text-white md:text-[68px] lg:text-[84px]">
            <Headline text={get("hero_headline", "Equipping the saints for the work of ministry.")} />
          </h1>
          <p className="font-display text-lg italic text-white/80 md:text-2xl">{get("hero_reference", "Ephesians 4:12")}</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {open ? (
              <Link to="/register" className={cn("inline-flex min-h-[52px] items-center justify-center rounded-xl px-7 font-extrabold", cta, darkRing)}>
                Apply now
              </Link>
            ) : (
              <a
                href={intakeHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("inline-flex min-h-[52px] items-center justify-center rounded-xl px-7 font-extrabold", cta, darkRing)}
              >
                {intakeLabel}
              </a>
            )}
            <Link
              to="/courses"
              {...prefetch("/courses")}
              className={cn(
                "inline-flex min-h-[52px] items-center justify-center rounded-xl border border-white/50 bg-white/5 px-7 font-bold text-white backdrop-blur-sm hover:bg-white/15",
                darkRing,
              )}
            >
              See the courses
            </Link>
          </div>
        </div>
      </HeroCarousel>

      {/* Quick actions: links only */}
      <Reveal className="mx-auto max-w-[1200px] px-4 pb-7 pt-8 md:px-8 md:pt-10">
        <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
          <a href={intakeHref} target="_blank" rel="noopener noreferrer" className={cn(quickTile, "bg-[#17112B] text-white", focusRing)}>
            <MessageCircle className={cn("h-6 w-6", accentOnDark)} aria-hidden="true" />
            <span className="text-[15px] font-bold leading-tight">{intakeLabel}</span>
          </a>
          <Link to="/courses" {...prefetch("/courses")} className={cn(quickTile, "border border-border bg-card", focusRing)}>
            <BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="text-[15px] font-bold leading-tight">See the courses</span>
          </Link>
          <Link to="/register" {...prefetch("/register")} className={cn(quickTile, cta, focusRing)}>
            <FilePlus2 className="h-6 w-6" aria-hidden="true" />
            <span className="text-[15px] font-bold leading-tight">Register</span>
          </Link>
          <Link to="/login" {...prefetch("/login")} className={cn(quickTile, "border border-border bg-card", focusRing)}>
            <LogIn className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="text-[15px] font-bold leading-tight">Student portal</span>
          </Link>
        </nav>
      </Reveal>

      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 md:px-8 lg:grid-cols-2 lg:items-start">
        {/* How you can study */}
        <Reveal>
          <section aria-labelledby="home-study" className="flex flex-col gap-4 rounded-3xl border border-border bg-card px-5 py-6">
            <h2 id="home-study" className="font-display text-[28px] font-medium leading-tight">{get("study_title", "How you can study")}</h2>
            <div role="group" aria-label="Learning mode" className="grid grid-cols-2 gap-1 rounded-[14px] bg-muted p-1">
              {(["physical", "online"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={cn(
                    "min-h-11 rounded-[11px] text-[15px] font-bold transition-colors",
                    mode === m ? "bg-foreground text-background" : "text-foreground/75 hover:text-foreground",
                    focusRing,
                  )}
                >
                  {m === "physical" ? "Physical" : "Online"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1" aria-live="polite">
              {shown.price && <span className="font-display text-[46px] font-bold leading-none text-primary">{shown.price}</span>}
              <span className={cn("text-sm text-muted-foreground", !shown.price && "text-base text-foreground")}>{shown.note}</span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {shown.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[15px] leading-snug">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>

        {/* How to join */}
        <section aria-labelledby="home-join" className="flex flex-col gap-4">
          <Reveal>
            <h2 id="home-join" className="font-display text-[28px] font-medium leading-tight">
              {get("journey_title", "Begin Your Ministry Journey")}
            </h2>
          </Reveal>
          <ol className="flex flex-col">
            {steps.map((s, i) => (
              <li key={s.n}>
                <Reveal delay={i * 80} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-extrabold", s.dot)}>{s.n}</span>
                    {i < steps.length - 1 && <span aria-hidden="true" className="my-1 w-0.5 flex-1 bg-border" />}
                  </div>
                  <div className={i < steps.length - 1 ? "pb-6 pt-2" : "pt-2"}>
                    <strong className="text-[17px]">{s.title}</strong>
                    <p className="mt-1 text-[15px] text-muted-foreground">{s.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="mx-auto mt-10 flex max-w-[1200px] flex-wrap items-center justify-between gap-2 border-t border-border px-4 pb-6 pt-4 text-[13px] text-muted-foreground md:px-8">
        <span>{get("footer_text", "© 2026 Spirit Life Cherubim & Seraphim Church. All rights reserved.")}</span>
        <div className="flex gap-0.5">
          {socialLinks.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={cn("inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted hover:text-foreground", focusRing)}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </a>
          ))}
        </div>
      </footer>

      {/* Phones: one action in the thumb zone */}
      <div
        aria-hidden={!pastHero}
        inert={!pastHero}
        className={cn(
          "sticky bottom-0 z-30 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 md:hidden",
          pastHero ? "translate-y-0" : "translate-y-full",
        )}
      >
        {open ? (
          <Link to="/register" className={cn("flex min-h-[54px] items-center justify-center rounded-2xl text-base font-extrabold", cta, focusRing)}>
            Apply now
          </Link>
        ) : (
          <a
            href={intakeHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("flex min-h-[54px] items-center justify-center gap-2.5 rounded-2xl text-base font-extrabold", cta, focusRing)}
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {intakeLabel}
          </a>
        )}
      </div>
    </div>
  );
};

export default Home;
