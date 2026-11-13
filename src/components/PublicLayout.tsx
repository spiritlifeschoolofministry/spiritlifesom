import { Link, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import WhatsAppButton from "@/components/WhatsAppButton";
import { preloadPath } from "@/routes/lazy-pages";
import { cn } from "@/lib/utils";
import { publicNavLinks as navLinks, socialLinks } from "@/components/redesign/public/public-links";

/** Warm a lazy page's chunk on hover / focus / touch, before the click lands. */
const prefetch = (path: string) => ({
  onMouseEnter: () => preloadPath(path),
  onFocus: () => preloadPath(path),
  onTouchStart: () => preloadPath(path),
});

/** "/verify/SLSM-..." still counts as being on Verify; "/" only matches itself. */
const isCurrent = (pathname: string, to: string) =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

const PublicLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const onLogin = location.pathname === "/login";
  // The home page draws its own top bar, menu and footer (pages/Home.tsx).
  const isHome = location.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ========== HEADER ========== */}
      {isHome ? null : (
        <header
          className={cn(
            "fixed top-0 inset-x-0 z-50 border-b border-border transition-all duration-300",
            scrolled ? "bg-card/95 shadow-sm backdrop-blur-sm" : "bg-card",
          )}
        >
          <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 h-16">
            <Link
              to="/"
              {...prefetch("/")}
              className={cn("flex min-w-0 items-center gap-2.5 rounded-lg text-foreground", focusRing)}
            >
              <img src="/images/school-logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
              <span className="truncate text-[15px] sm:text-lg font-extrabold tracking-tight">
                Spirit Life School of Ministry
              </span>
            </Link>

            {/* Desktop nav */}
            <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
              {navLinks.map((l) => {
                const current = isCurrent(location.pathname, l.to);
                return (
                  <Link
                    key={l.label}
                    to={l.to}
                    {...prefetch(l.to)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-[10px] px-3.5 text-[15px] transition-colors",
                      current
                        ? "bg-secondary font-semibold text-secondary-foreground"
                        : "font-medium text-foreground/80 hover:bg-secondary/60 hover:text-foreground",
                      focusRing,
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
              <Link
                to="/login"
                {...prefetch("/login")}
                aria-current={onLogin ? "page" : undefined}
                className={cn(
                  "ml-2 inline-flex min-h-11 items-center rounded-[10px] border border-primary/25 px-4 text-[15px] font-semibold text-primary transition-colors hover:bg-secondary dark:text-foreground",
                  onLogin && "bg-secondary text-secondary-foreground",
                  focusRing,
                )}
              >
                Log in
              </Link>
              <Link
                to="/register"
                {...prefetch("/register")}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-[10px] bg-primary px-[18px] text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
                  focusRing,
                )}
              >
                Apply now
              </Link>
            </nav>

            {/* Mobile toggle */}
            <button
              type="button"
              className={cn(
                "lg:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-foreground hover:bg-secondary",
                focusRing,
              )}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
            </button>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <nav
              id="public-mobile-menu"
              aria-label="Main"
              className="lg:hidden border-t border-border bg-card px-4 pb-4 pt-2 shadow-sm"
            >
              <ul className="space-y-1">
                {navLinks.map((l) => {
                  const current = isCurrent(location.pathname, l.to);
                  return (
                    <li key={l.label}>
                      <Link
                        to={l.to}
                        {...prefetch(l.to)}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 w-full items-center rounded-[10px] px-3 text-[15px]",
                          current
                            ? "bg-secondary font-semibold text-secondary-foreground"
                            : "font-medium text-foreground/80 hover:bg-secondary/60",
                          focusRing,
                        )}
                      >
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="grid grid-cols-2 gap-2 pt-3">
                <Link
                  to="/login"
                  {...prefetch("/login")}
                  aria-current={onLogin ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-primary/25 text-[15px] font-semibold text-primary dark:text-foreground",
                    onLogin && "bg-secondary text-secondary-foreground",
                    focusRing,
                  )}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  {...prefetch("/register")}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center rounded-[10px] bg-primary text-[15px] font-semibold text-primary-foreground",
                    focusRing,
                  )}
                >
                  Apply now
                </Link>
              </div>
            </nav>
          )}
        </header>
      )}

      {/* ========== PAGE CONTENT ========== */}
      <main className={isHome ? undefined : "pt-16"}>
        <Outlet />
      </main>

      {/* ========== FOOTER ========== */}
      {isHome ? null : (
        <footer className="bg-[#120B24] text-white/80 pt-12 pb-6 px-4 sm:px-6">
          <div className="max-w-[1200px] mx-auto space-y-8">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
              <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-white">
                <img src="/images/school-logo.png" alt="" className="h-9 w-9 object-contain" />
                Spirit Life School of Ministry
              </span>
              <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-1 gap-y-1 text-sm">
                {[...navLinks, { label: "Apply", to: "/register" }, { label: "Log in", to: "/login" }].map((l) => (
                  <Link
                    key={l.label}
                    to={l.to}
                    className="inline-flex min-h-11 items-center rounded-lg px-2.5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B5FD]"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="flex gap-1">
                {socialLinks.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B5FD]"
                  >
                    <Icon size={20} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10" />

            <p className="text-center text-sm text-white/70 italic">
              Spirit Life School of Ministry — "Equipping The Saints..."
            </p>

            <div className="border-t border-white/10" />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/60">
              <span>© 2026 Spirit Life Cherubim & Seraphim Church. All rights reserved.</span>
              <span className="italic">Ephesians 4:12-13</span>
            </div>
          </div>
        </footer>
      )}

      <WhatsAppButton />
    </div>
  );
};

export default PublicLayout;
