import { Link } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Mail, ChevronRight, ArrowRight } from "lucide-react";

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

function Section({ className, children }: { className?: string; children: React.ReactNode }) {
  const fade = useFadeIn();
  return <section ref={fade.ref} className={`${fade.className} ${className ?? ""}`}>{children}</section>;
}

const Home = () => (
  <div>
    {/* ========== HERO ========== */}
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center text-center text-primary-foreground">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/images/som1.jpeg)" }} />
      <div className="absolute inset-0 bg-primary/70" />
      <div className="relative z-10 max-w-3xl px-6 space-y-6">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
          Spirit Life School of Ministry
        </h1>
        <p className="text-xl sm:text-2xl font-medium italic text-primary-foreground/90">
          "Equipping The Saints..."
        </p>
        <p className="text-base sm:text-lg text-primary-foreground/80 max-w-xl mx-auto">
          "...for the work of ministry, for building up the body of Christ" — Ephesians 4:12
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button asChild size="lg" className="gradient-flame border-0 text-primary-foreground text-base px-8 hover:opacity-90">
            <Link to="/register">Register Now</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 text-base px-8">
            <Link to="/about">Learn More</Link>
          </Button>
        </div>
      </div>
    </section>

    {/* ========== BRIEF ABOUT ========== */}
    <Section className="py-20 px-4 sm:px-6 bg-background">
      <div className="max-w-4xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary">About Spirit Life SOM</h2>
        <p className="text-muted-foreground leading-relaxed text-lg">
          Spirit Life School of Ministry exists to thoroughly equip women, men and brethren who are genuinely
          called by God into Ministry with the accurate Word of God. Rooted in Scripture and led by the Holy Spirit,
          we are committed to raising men and women who are grounded in biblical truth and prepared for effective
          service in God's vineyard.
        </p>
        <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10">
          <Link to="/about" className="flex items-center gap-2">Learn More <ArrowRight size={16} /></Link>
        </Button>
      </div>
    </Section>

    {/* ========== BRIEF COURSES ========== */}
    <Section className="py-20 px-4 sm:px-6 bg-secondary/50">
      <div className="max-w-4xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary">Our Programme</h2>
        <p className="text-muted-foreground text-lg">
          11 comprehensive courses designed to ground you in biblical truth and prepare you for ministry.
        </p>
        <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10">
          <Link to="/courses" className="flex items-center gap-2">View All Courses <ArrowRight size={16} /></Link>
        </Button>
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
              <div className="w-14 h-14 rounded-full gradient-flame text-primary-foreground flex items-center justify-center text-xl font-bold">
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
        <Button asChild size="lg" className="gradient-flame border-0 text-primary-foreground text-base px-10 hover:opacity-90">
          <Link to="/register">Register Now</Link>
        </Button>
      </div>
    </Section>

    {/* ========== CONTACT INFO ========== */}
    <Section className="py-16 px-4 sm:px-6 bg-background">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-primary text-center mb-8">Contact Us</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="text-accent shrink-0" size={18} />
            <span>Ibadan, Nigeria</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="text-accent shrink-0" size={18} />
            <span>+234 809 092 5555</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="text-accent shrink-0" size={18} />
            <span>spiritlifeschoolofministry@gmail.com</span>
          </div>
        </div>
      </div>
    </Section>
  </div>
);

export default Home;
