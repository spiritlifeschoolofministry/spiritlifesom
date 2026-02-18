import { Link, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Facebook, Youtube, Instagram } from "lucide-react";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "About", to: "/about" },
  { label: "Courses", to: "/courses" },
  { label: "Faculty", to: "/faculty" },
  { label: "Contact", to: "/contact" },
];

const PublicLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

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
      {/* ========== NAVBAR ========== */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-primary/95 shadow-lg backdrop-blur-sm" : "bg-primary"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <Link to="/" className="text-primary-foreground font-bold text-lg tracking-tight">
            Spirit Life SOM
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === l.to
                    ? "text-primary-foreground"
                    : "text-primary-foreground/75 hover:text-primary-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild size="sm" className="gradient-flame border-0 text-primary-foreground hover:opacity-90">
              <Link to="/register">Register Now</Link>
            </Button>
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden text-primary-foreground" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-primary border-t border-primary-foreground/10 px-4 pb-4 space-y-2">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="block w-full text-left text-primary-foreground/90 hover:text-primary-foreground py-2 text-sm"
              >
                {l.label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="flex-1 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild size="sm" className="flex-1 gradient-flame border-0 text-primary-foreground">
                <Link to="/register">Register</Link>
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* ========== PAGE CONTENT ========== */}
      <main className="pt-16">
        <Outlet />
      </main>

      {/* ========== FOOTER ========== */}
      <footer className="bg-[hsl(0,0%,5%)] text-primary-foreground/80 pt-12 pb-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <span className="font-bold text-lg text-primary-foreground">Spirit Life SOM</span>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              {navLinks.map((l) => (
                <Link key={l.label} to={l.to} className="hover:text-primary-foreground transition-colors">
                  {l.label}
                </Link>
              ))}
              <Link to="/register" className="hover:text-primary-foreground transition-colors">Register</Link>
              <Link to="/login" className="hover:text-primary-foreground transition-colors">Login</Link>
            </div>
            <div className="flex gap-4">
              <a href="#" className="hover:text-primary-foreground transition-colors"><Facebook size={20} /></a>
              <a href="#" className="hover:text-primary-foreground transition-colors"><Youtube size={20} /></a>
              <a href="#" className="hover:text-primary-foreground transition-colors"><Instagram size={20} /></a>
            </div>
          </div>

          <div className="border-t border-primary-foreground/10" />

          <p className="text-center text-sm text-primary-foreground/60 italic">
            Spirit Life School of Ministry — "Equipping The Saints..."
          </p>

          <div className="border-t border-primary-foreground/10" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-primary-foreground/50">
            <span>© 2026 Spirit Life Cherubim & Seraphim Church. All rights reserved.</span>
            <span className="italic">Ephesians 4:12-13</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
