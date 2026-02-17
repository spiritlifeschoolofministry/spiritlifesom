import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Flame,
  Users,
  Award,
  MapPin,
  Phone,
  Mail,
  Menu,
  X,
  ArrowRight,
  Check,
  Facebook,
  Youtube,
  Instagram,
  ChevronRight,
} from "lucide-react";

const navLinks = [
  { label: "Home", href: "#" },
  { label: "About", href: "#about" },
  { label: "Courses", href: "#courses" },
  { label: "Faculty", href: "#faculty" },
  { label: "Contact", href: "#contact" },
];

const courses = [
  { code: "SLSM101", title: "The Canon of Scriptures" },
  { code: "SLSM102", title: "The Basic Bible Interpretation" },
  { code: "SLSM103", title: "The Basic Bible Doctrines" },
  { code: "SLSM104", title: "The Concept of Ministry" },
  { code: "SLSM105", title: "Spiritual Maturing" },
  { code: "SLSM106", title: "The Principle of Honor" },
  { code: "SLSM107", title: "Church Conflict Management & Resolution" },
  { code: "SLSM108", title: "The Biblical Concept of Leadership" },
  { code: "SLSM109", title: "Ministerial Ethics" },
  { code: "SLSM110", title: "Balancing Marriage and Ministry" },
  { code: "SLSM111", title: "Ministry and Marketplace" },
];

const whyCards = [
  { icon: BookOpen, title: "Biblical Foundation", desc: "Every lesson is rooted in the Word of God" },
  { icon: Flame, title: "Spirit-Led Teaching", desc: "Guided by the Holy Spirit in every session" },
  { icon: Users, title: "Community & Fellowship", desc: "Learn alongside believers who share your calling" },
  { icon: Award, title: "Practical Ministry Training", desc: "Not just theory — real preparation for ministry life" },
];

const faculty = [
  {
    initials: "CO",
    name: "Prophet Cherub Obadare",
    title: "Director, School of Ministry",
    bio: "A seasoned minister of the Gospel and leader of Spirit Life C&S Church, Prophet Obadare brings deep biblical insight and spiritual authority to guide students in their ministerial journey.",
  },
  {
    initials: "KO",
    name: "Prophet Kayode Olagunju",
    title: "School Coordinator",
    bio: "Prophet Olagunju oversees the academic and operational structure of the school, ensuring every student receives the support they need to thrive spiritually and academically.",
  },
  {
    initials: "WF",
    name: "Bro Williams Folorunsho",
    title: "Teacher",
    bio: "Bro Williams brings practical ministry experience and a passion for teaching the Word, helping students connect biblical knowledge to real-world ministry application.",
  },
];

const galleryImages = [
  "/images/som3.jpeg",
  "/images/som4.jpeg",
  "/images/som5.jpeg",
  "/images/som7.jpeg",
  "/images/som8.jpeg",
];

/* ---- Fade-in on scroll hook ---- */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, className: `transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}` };
}

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  const fade = useFadeIn();
  return (
    <section id={id} ref={fade.ref} className={`${fade.className} ${className ?? ""}`}>
      {children}
    </section>
  );
}

const Home = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMenuOpen(false);
    if (href === "#") return window.scrollTo({ top: 0, behavior: "smooth" });
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* ========== NAVBAR ========== */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-[hsl(270,52%,37%)]/95 shadow-lg backdrop-blur-sm" : "bg-[hsl(270,52%,37%)]"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <button onClick={() => scrollTo("#")} className="text-white font-bold text-lg tracking-tight">
            Spirit Life SOM
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <button key={l.label} onClick={() => scrollTo(l.href)} className="text-white/90 hover:text-white text-sm font-medium transition-colors">
                {l.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild size="sm" className="gradient-flame border-0 text-white hover:opacity-90">
              <Link to="/register">Register Now</Link>
            </Button>
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-[hsl(270,52%,37%)] border-t border-white/10 px-4 pb-4 space-y-2">
            {navLinks.map((l) => (
              <button key={l.label} onClick={() => scrollTo(l.href)} className="block w-full text-left text-white/90 hover:text-white py-2 text-sm">
                {l.label}
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="flex-1 border-white/30 text-white hover:bg-white/10">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild size="sm" className="flex-1 gradient-flame border-0 text-white">
                <Link to="/register">Register</Link>
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* ========== HERO ========== */}
      <section className="relative min-h-screen flex items-center justify-center text-center text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/images/som1.jpeg)" }}
        />
        <div className="absolute inset-0 bg-[hsl(270,52%,37%)]/70" />
        <div className="relative z-10 max-w-3xl px-6 space-y-6">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Spirit Life School of Ministry
          </h1>
          <p className="text-xl sm:text-2xl font-medium italic text-white/90">
            "Equipping The Saints..."
          </p>
          <p className="text-base sm:text-lg text-white/80 max-w-xl mx-auto">
            "...for the work of ministry, for building up the body of Christ" — Ephesians 4:12
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button asChild size="lg" className="gradient-flame border-0 text-white text-base px-8 hover:opacity-90">
              <Link to="/register">Register Now</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white/10 text-base px-8"
              onClick={() => scrollTo("#about")}
            >
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* ========== ABOUT ========== */}
      <Section id="about" className="py-20 px-4 sm:px-6 bg-background">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary">About Spirit Life School of Ministry</h2>
            <p className="text-muted-foreground leading-relaxed">
              In a time like this, women, men and brethren who are genuinely called by God into Ministry need a platform
              where they can be thoroughly equipped with the accurate Word of God — to help them see clearly the call of
              God and how to embrace it. Spirit Life School of Ministry exists to be that platform. Rooted in Scripture
              and led by the Holy Spirit, we are committed to raising men and women who are grounded in biblical truth
              and prepared for effective service in God's vineyard.
            </p>
            <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground">
              <p>
                "Whoever wants to embrace the call of God in their life must go through thorough learning, teaching and
                furnishing" — Ephesians 4:12-13
              </p>
              <footer className="mt-2 text-sm font-semibold text-primary not-italic">
                — Prophet Cherub Obadare, Director
              </footer>
            </blockquote>
          </div>
          <div className="rounded-xl overflow-hidden shadow-lg">
            <img src="/images/som2.jpeg" alt="Spirit Life SOM Class" className="w-full h-auto object-cover" loading="lazy" />
          </div>
        </div>
      </Section>

      {/* ========== WHY CHOOSE US ========== */}
      <Section className="py-20 px-4 sm:px-6 bg-secondary/50">
        <div className="max-w-6xl mx-auto text-center space-y-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary">Why Spirit Life SOM?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyCards.map((c) => (
              <Card key={c.title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <c.icon className="text-primary" size={28} />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground">{c.title}</h3>
                  <p className="text-muted-foreground text-sm">{c.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ========== COURSES & PRICING ========== */}
      <Section id="courses" className="py-20 px-4 sm:px-6 bg-background">
        <div className="max-w-6xl mx-auto space-y-14">
          <div className="text-center space-y-2">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary">Our Programme</h2>
            <p className="text-muted-foreground">Basic Programme — 2025/26 Academic Session</p>
          </div>

          {/* Course grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <Card key={c.code} className="border-primary/20 hover:border-primary/40 transition-colors">
                <CardContent className="p-5 flex items-start gap-3">
                  <span className="text-xs font-bold text-accent whitespace-nowrap">{c.code}</span>
                  <span className="text-sm font-medium text-foreground">{c.title}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pricing */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Physical */}
            <Card className="border-primary/30 relative">
              <CardContent className="p-8 space-y-6">
                <div>
                  <p className="text-sm font-semibold text-primary uppercase tracking-wide">Physical</p>
                  <p className="text-4xl font-extrabold text-foreground mt-1">FREE</p>
                </div>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {[
                    "Weekly Saturday classes (9AM - 12PM)",
                    "In-person lectures and practicals",
                    "Access to course materials (fee applies)",
                    "Project defense and graduation",
                  ].map((f) => (
                    <li key={f} className="flex gap-2"><Check size={16} className="text-primary shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                  <Link to="/register">Register Free</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Online */}
            <Card className="border-0 gradient-flame text-white relative overflow-hidden shadow-xl">
              <div className="absolute top-4 right-4 bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                Most Popular
              </div>
              <CardContent className="p-8 space-y-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-white/90">Online</p>
                  <p className="text-4xl font-extrabold mt-1">₦30,000</p>
                </div>
                <ul className="space-y-3 text-sm text-white/90">
                  {[
                    "Live Zoom sessions every Saturday",
                    "Full training materials included",
                    "Class recordings access",
                    "Must attend physically for project defense and graduation",
                  ].map((f) => (
                    <li key={f} className="flex gap-2"><Check size={16} className="shrink-0 mt-0.5" />{f}</li>
                  ))}
                </ul>
                <Button asChild className="w-full bg-white text-primary hover:bg-white/90 font-semibold">
                  <Link to="/register">Register Now</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>

      {/* ========== FACULTY ========== */}
      <Section id="faculty" className="py-20 px-4 sm:px-6 bg-secondary/50">
        <div className="max-w-6xl mx-auto space-y-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary text-center">Meet Our Faculty</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {faculty.map((f) => (
              <Card key={f.name} className="border-0 shadow-md">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="mx-auto w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold">
                    {f.initials}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground">{f.name}</h3>
                    <p className="text-sm text-accent font-medium">{f.title}</p>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ========== HISTORY & GALLERY ========== */}
      <Section id="history" className="py-20 px-4 sm:px-6 bg-background">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary">Our Story</h2>
            <p className="text-muted-foreground leading-relaxed">
              Spirit Life School of Ministry was established by Spirit Life Cherubim and Seraphim Church, Ibadan,
              Nigeria, under the leadership of Prophet Cherub Obadare. Born out of a burden to see believers properly
              equipped for the work of ministry, the school was founded on the conviction that the call of God must be
              matched with thorough preparation. What began as a vision to train church members has grown into a full
              ministry training programme that has already seen its first cohort graduate and go on to serve effectively
              in God's vineyard. Today, Spirit Life SOM continues to equip a new generation of believers — physically
              and online — for ministry life.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {galleryImages.map((src, i) => (
              <div key={i} className="rounded-lg overflow-hidden shadow-md aspect-square">
                <img src={src} alt={`SOM Gallery ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ========== HOW TO APPLY ========== */}
      <Section className="py-20 px-4 sm:px-6 bg-primary/5">
        <div className="max-w-4xl mx-auto text-center space-y-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary">Begin Your Ministry Journey</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Apply", desc: "Fill in the registration form online" },
              { step: "2", title: "Get Admitted", desc: "Await your admission decision" },
              { step: "3", title: "Start Learning", desc: "Begin your transformation" },
            ].map((s, i) => (
              <div key={s.step} className="flex flex-col items-center gap-3 relative">
                <div className="w-14 h-14 rounded-full gradient-flame text-white flex items-center justify-center text-xl font-bold">
                  {s.step}
                </div>
                <h3 className="font-semibold text-lg text-foreground">{s.title}</h3>
                <p className="text-muted-foreground text-sm">{s.desc}</p>
                {i < 2 && (
                  <ChevronRight className="hidden sm:block absolute -right-3 top-4 text-primary/40" size={28} />
                )}
              </div>
            ))}
          </div>
          <Button asChild size="lg" className="gradient-flame border-0 text-white text-base px-10 hover:opacity-90">
            <Link to="/register">Register Now</Link>
          </Button>
        </div>
      </Section>

      {/* ========== CONTACT ========== */}
      <Section id="contact" className="py-20 px-4 sm:px-6 bg-background">
        <div className="max-w-6xl mx-auto space-y-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary text-center">Get In Touch</h2>
          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact info */}
            <div className="space-y-6">
              <div className="flex gap-4">
                <MapPin className="text-accent shrink-0 mt-1" size={20} />
                <p className="text-muted-foreground">Spirit Life C&S Church, John Olorombo Street, Balogun Isale, 200258, Ibadan, Nigeria</p>
              </div>
              <div className="flex gap-4">
                <Phone className="text-accent shrink-0 mt-1" size={20} />
                <p className="text-muted-foreground">+234 809 092 5555</p>
              </div>
              <div className="flex gap-4">
                <Mail className="text-accent shrink-0 mt-1" size={20} />
                <p className="text-muted-foreground">spiritlifeschoolofministry@gmail.com</p>
              </div>
              <div className="rounded-xl overflow-hidden border border-border h-48 bg-muted flex items-center justify-center text-muted-foreground text-sm">
                Map placeholder
              </div>
            </div>

            {/* Contact form */}
            <div className="space-y-4">
              <Input placeholder="Full Name" className="bg-card" />
              <Input placeholder="Email" type="email" className="bg-card" />
              <Textarea placeholder="Your message..." rows={5} className="bg-card" />
              <Button className="w-full gradient-flame border-0 text-white hover:opacity-90">Send Message</Button>
            </div>
          </div>
        </div>
      </Section>

      {/* ========== FOOTER ========== */}
      <footer className="bg-[hsl(0,0%,5%)] text-white/80 pt-12 pb-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Top */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <span className="font-bold text-lg text-white">Spirit Life SOM</span>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              {["Home", "About", "Courses", "Faculty", "Contact"].map((l) => (
                <button key={l} onClick={() => scrollTo(l === "Home" ? "#" : `#${l.toLowerCase()}`)} className="hover:text-white transition-colors">
                  {l}
                </button>
              ))}
              <Link to="/register" className="hover:text-white transition-colors">Register</Link>
              <Link to="/login" className="hover:text-white transition-colors">Login</Link>
            </div>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors"><Facebook size={20} /></a>
              <a href="#" className="hover:text-white transition-colors"><Youtube size={20} /></a>
              <a href="#" className="hover:text-white transition-colors"><Instagram size={20} /></a>
            </div>
          </div>

          <div className="border-t border-white/10" />

          <p className="text-center text-sm text-white/60 italic">
            Spirit Life School of Ministry — "Equipping The Saints..."
          </p>

          <div className="border-t border-white/10" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/50">
            <span>© 2026 Spirit Life Cherubim & Seraphim Church. All rights reserved.</span>
            <span className="italic">Ephesians 4:12-13</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
