import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Mail, ChevronRight, ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Reveal from "@/components/Reveal";
import { useSiteContent } from "@/hooks/use-site-content";
import SEO from "@/components/SEO";

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
        <Button asChild size="lg" variant="flame" className="text-base px-8">
          <Link to="/register">Begin Your Application →</Link>
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
    {/* ========== HERO ========== */}
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
      {heroImages.map((src, index) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover object-[center_28%] transition-opacity duration-1000 ease-in-out ${index === currentSlide ? "opacity-100 animate-ken-burns" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(26,12,48,0.94)_0%,rgba(45,27,105,0.82)_42%,rgba(45,27,105,0.28)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(20,9,40,0.75),transparent_45%)]" />
      <Reveal className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 text-primary-foreground">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3.5 mb-6">
            <span className="h-px w-11 bg-[#F9CB28]" />
            <span className="font-display text-[11px] tracking-[0.28em] uppercase text-[#F9CB28] font-semibold">Ibadan, Nigeria · Spirit-Led Training</span>
          </div>
          <h1 className="font-serif font-semibold leading-[0.98] text-5xl sm:text-6xl md:text-[76px]">
            {get("hero_title", "Equipping the Saints for the work of ministry.")}
          </h1>
          <p className="text-lg text-primary-foreground/80 max-w-lg mt-7 font-light leading-relaxed">
            {get("hero_subtitle", "A Spirit-led school raising men and women grounded in biblical truth and prepared for effective service in God's vineyard.")}
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-9">
            <RegisterButtons />
            <Button asChild size="lg" variant="outline" className="bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground text-base px-8">
              <Link to="/courses">Explore Courses</Link>
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-10">
            {heroImages.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentSlide(index)}
                className={`h-1.5 rounded-full transition-all ${currentSlide === index ? "w-7 bg-[#F9CB28]" : "w-3 bg-primary-foreground/40 hover:bg-primary-foreground/70"}`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </Reveal>
      <div className="hidden lg:block absolute right-10 bottom-11 z-10 text-right text-primary-foreground/75 max-w-[280px]">
        <div className="font-serif italic text-[22px] leading-snug">"...for building up the body of Christ"</div>
        <div className="font-display text-[11px] tracking-[0.24em] uppercase mt-2 text-[#F9CB28]">Ephesians 4 : 12</div>
      </div>
    </section>

    {/* ========== STAT STRIP ========== */}
    <div className="bg-primary text-primary-foreground grid grid-cols-2 md:grid-cols-4">
      {[
        { n: get("stat1_value", "2"), l: get("stat1_label", "Cohorts Graduated") },
        { n: get("stat2_value", "100%"), l: get("stat2_label", "Scripture-Rooted") },
        { n: get("stat3_value", "Online"), l: get("stat3_label", "& On-Campus Modes") },
        { n: get("stat4_value", "Open"), l: get("stat4_label", "Interdenominational · to all saints") },
      ].map((s, i) => (
        <div key={i} className={`px-8 py-7 border-primary-foreground/12 ${i < 3 ? "md:border-r" : ""} ${i < 2 ? "border-b md:border-b-0" : ""} ${i === 0 ? "border-r md:border-r" : ""} ${i === 2 ? "border-r md:border-r" : ""}`}>
          <div className="font-serif text-4xl font-semibold text-[#F9CB28] leading-none">{s.n}</div>
          <div className="font-display text-[10.5px] tracking-[0.12em] uppercase opacity-75 mt-1.5">{s.l}</div>
        </div>
      ))}
    </div>

    {/* ========== ABOUT ========== */}
    <Reveal className="py-24 px-4 sm:px-6 bg-background">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
        <div className="relative">
          <img src="/images/som4.jpeg" alt="Spirit Life graduation" className="w-full h-[440px] object-cover rounded" />
          <div className="absolute -bottom-7 -left-7 bg-background px-7 py-5 rounded shadow-[var(--shadow-card)] hidden sm:block">
            <div className="font-serif italic text-2xl text-primary leading-tight">Equipping<br />The Saints</div>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px w-9 bg-gold" />
            <span className="eyebrow">Who We Are</span>
          </div>
          <h2 className="font-serif text-4xl sm:text-5xl font-semibold text-foreground leading-[1.02] mb-6">{get("about_title", "Rooted in Scripture, led by the Spirit.")}</h2>
          <p className="text-muted-foreground leading-relaxed text-base mb-8">
            {get("about_text", "Spirit Life School of Ministry exists to thoroughly equip men, women and brethren who are genuinely called by God into Ministry with the accurate Word of God. Rooted in Scripture and led by the Holy Spirit, we are committed to raising men and women who are grounded in biblical truth and prepared for effective service in God's vineyard.")}
          </p>
          <Link to="/about" className="inline-flex items-center gap-2 text-sm font-semibold text-primary border-b-2 border-[#F9CB28] pb-1.5">Learn our story <ArrowRight size={16} /></Link>
        </div>
      </div>
    </Reveal>

    {/* ========== PROGRAMME ========== */}
    <Reveal className="py-24 px-4 sm:px-6 bg-secondary/60">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="eyebrow mb-3">Our Programme</div>
          <h2 className="font-serif text-4xl sm:text-5xl font-semibold text-foreground leading-[1.02] mb-4">{get("programme_title", "A curriculum to ground you for ministry")}</h2>
          <p className="text-muted-foreground text-base">{get("programme_text", "Comprehensive courses designed to establish you in biblical truth and pastoral practice.")}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { img: "/images/som5.jpeg", eyebrow: "Foundations", title: "Biblical Doctrine", desc: "The whole counsel of Scripture, taught with accuracy and reverence." },
            { img: "/images/som7.jpeg", eyebrow: "Formation", title: "Pastoral Practice", desc: "Shepherding, preaching and the practical work of the ministry." },
            { img: "/images/som8.jpeg", eyebrow: "Sending", title: "Spirit-Led Service", desc: "Walking in the power of the Holy Spirit for effective service." },
          ].map((c, i) => (
            <Reveal key={c.title} delay={i * 80} className="bg-card rounded-lg overflow-hidden shadow-[var(--shadow-card)]">
              <img src={c.img} alt="" className="w-full h-48 object-cover" />
              <div className="p-7">
                <div className="font-display text-[11px] tracking-[0.2em] uppercase text-gold font-semibold">{c.eyebrow}</div>
                <h3 className="font-serif text-2xl font-semibold text-foreground mt-2 mb-2.5">{c.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="text-center mt-12">
          <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary/10">
            <Link to="/courses" className="flex items-center gap-2">View All Courses <ArrowRight size={16} /></Link>
          </Button>
        </div>
      </div>
    </Reveal>

    {/* ========== HOW TO APPLY ========== */}
    <Reveal className="py-24 px-4 sm:px-6 bg-background">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <div className="eyebrow mb-3">Three Simple Steps</div>
          <h2 className="font-serif text-4xl sm:text-5xl font-semibold text-foreground">{get("journey_title", "Begin your ministry journey")}</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-10">
          {steps.map((s, i) => (
            <Reveal key={s.step} delay={i * 80} className="text-center relative">
              <div className="w-16 h-16 mx-auto mb-5 rounded-full gradient-flame text-[#3a1d1d] flex items-center justify-center font-serif text-3xl font-bold">
                {s.step}
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">{s.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              {i < 2 && (
                <ChevronRight className="hidden sm:block absolute -right-4 top-4 text-gold/50" size={28} />
              )}
            </Reveal>
          ))}
        </div>
        <div className="text-center mt-14">
          <RegisterButtons />
        </div>
      </div>
    </Reveal>

    {/* ========== CONTACT INFO ========== */}
    <Reveal className="py-16 px-4 sm:px-6 bg-secondary/60">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-serif text-3xl font-semibold text-foreground text-center mb-8">Contact Us</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="text-gold shrink-0" size={18} />
            <span>{get("contact_address", "Ibadan, Nigeria")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="text-gold shrink-0" size={18} />
            <span>{get("contact_phone", "+234 916 582 2262")}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="text-gold shrink-0" size={18} />
            <span className="truncate">{get("contact_email", "spiritlifeschoolofministry@gmail.com")}</span>
          </div>
        </div>
      </div>
    </Reveal>
    </div>
  );
};

export default Home;
