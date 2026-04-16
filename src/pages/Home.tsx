import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Mail, ChevronRight, ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Reveal from "@/components/Reveal";
import { useSiteContent } from "@/hooks/use-site-content";

const Home = () => {
  const [acceptingApplications, setAcceptingApplications] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const { get } = useSiteContent("home");

  useEffect(() => {
    const fetchEnrollmentStatus = async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'accepting_applications')
          .single();

        if (data) {
          const val = data.value;
          setAcceptingApplications(val === true || val === 'true');
        }
      } catch (err) {
        console.error('Error fetching enrollment status:', err);
      }
    };

    fetchEnrollmentStatus();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % 7);
    }, 8000);
    return () => window.clearInterval(interval);
  }, []);

  const RegisterButtons = () => (
    <>
      {acceptingApplications ? (
        <Button asChild size="lg" className="gradient-flame border-0 text-primary-foreground text-base px-8 hover:opacity-90">
          <Link to="/register">Register Now</Link>
        </Button>
      ) : (
        <Button disabled size="lg" className="bg-gray-400 text-white text-base px-8 cursor-not-allowed" title="Admissions closed">
          <Lock className="mr-2 h-4 w-4" />
          Admissions Closed
        </Button>
      )}
    </>
  );

  const heroImages = [
    "/images/som3.jpeg",
    "/images/som4.jpeg",
    "/images/som5.jpeg",
    "/images/som7.jpeg",
    "/images/som8.jpeg",
    "/images/som1.jpeg",
    "/images/som2.jpeg",
  ];

  const steps = [
    { step: "1", title: get("step1_title", "Apply"), desc: get("step1_desc", "Fill in the registration form online") },
    { step: "2", title: get("step2_title", "Get Admitted"), desc: get("step2_desc", "Await your admission decision") },
    { step: "3", title: get("step3_title", "Start Learning"), desc: get("step3_desc", "Begin your transformation") },
  ];

  return (
    <div>
    {/* ========== HERO ========== */}
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center text-center text-primary-foreground overflow-hidden">
      {heroImages.map((src, index) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${index === currentSlide ? "opacity-100 animate-ken-burns" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-primary/70" />
      <Reveal className="relative z-10 max-w-3xl px-6 space-y-6">
        <div className="flex items-center justify-center gap-2 pt-4">
          {heroImages.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentSlide(index)}
              className={`h-2.5 w-2.5 rounded-full transition-all ${currentSlide === index ? "bg-primary" : "bg-primary/40 hover:bg-primary/70"}`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
        <img src="/images/school-logo.png" alt="" className="h-24 w-24 object-contain mx-auto" />
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
          {get("hero_title", "Spirit Life School of Ministry")}
        </h1>
        <p className="text-xl sm:text-2xl font-medium italic text-primary-foreground/90">
          {get("hero_subtitle", '"Equipping The Saints..."')}
        </p>
        <p className="text-base sm:text-lg text-primary-foreground/80 max-w-xl mx-auto">
          {get("hero_scripture", '"...for the work of ministry, for building up the body of Christ" — Ephesians 4:12')}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <RegisterButtons />
          <Button asChild size="lg" variant="outline" className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 text-base px-8">
            <Link to="/about">Learn More</Link>
          </Button>
        </div>
      </Reveal>
    </section>

    {/* ========== BRIEF ABOUT ========== */}
    <Reveal className="py-20 px-4 sm:px-6 bg-background">
      <div className="max-w-4xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary">{get("about_title", "About Spirit Life SOM")}</h2>
        <p className="text-muted-foreground leading-relaxed text-lg">
          {get("about_text", "Spirit Life School of Ministry exists to thoroughly equip men, women and brethren who are genuinely called by God into Ministry with the accurate Word of God. Rooted in Scripture and led by the Holy Spirit, we are committed to raising men and women who are grounded in biblical truth and prepared for effective service in God's vineyard.")}
        </p>
        <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10">
          <Link to="/about" className="flex items-center gap-2">Learn More <ArrowRight size={16} /></Link>
        </Button>
      </div>
    </Reveal>

    {/* ========== BRIEF COURSES ========== */}
    <Reveal className="py-20 px-4 sm:px-6 bg-secondary/50">
      <div className="max-w-4xl mx-auto text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary">{get("programme_title", "Our Programme")}</h2>
        <p className="text-muted-foreground text-lg">
          {get("programme_text", "Detailed comprehensive courses designed to ground you in biblical truth and prepare you for ministry.")}
        </p>
        <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10">
          <Link to="/courses" className="flex items-center gap-2">View All Courses <ArrowRight size={16} /></Link>
        </Button>
      </div>
    </Reveal>

    {/* ========== HOW TO APPLY ========== */}
    <Reveal className="py-20 px-4 sm:px-6 bg-primary/5">
      <div className="max-w-4xl mx-auto text-center space-y-12">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary">{get("journey_title", "Begin Your Ministry Journey")}</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <Reveal key={s.step} delay={i * 80} className="flex flex-col items-center gap-3 relative">
              <div className="w-14 h-14 rounded-full gradient-flame text-primary-foreground flex items-center justify-center text-xl font-bold">
                {s.step}
              </div>
              <h3 className="font-semibold text-lg text-foreground">{s.title}</h3>
              <p className="text-muted-foreground text-sm">{s.desc}</p>
              {i < 2 && (
                <ChevronRight className="hidden sm:block absolute -right-3 top-4 text-primary/40" size={28} />
              )}
            </Reveal>
          ))}
        </div>
        <RegisterButtons />
      </div>
    </Reveal>

    {/* ========== CONTACT INFO ========== */}
    <Reveal className="py-16 px-4 sm:px-6 bg-background">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-primary text-center mb-8">Contact Us</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="text-accent shrink-0" size={18} />
            <span>{get("contact_address", "Ibadan, Nigeria")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="text-accent shrink-0" size={18} />
            <span>{get("contact_phone", "+234 809 092 5555")}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="text-accent shrink-0" size={18} />
            <span className="truncate">{get("contact_email", "spiritlifeschoolofministry@gmail.com")}</span>
          </div>
        </div>
      </div>
    </Reveal>
    </div>
  );
};

export default Home;
