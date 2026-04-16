import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Flame, Users, Award } from "lucide-react";
import Reveal from "@/components/Reveal";
import { useSiteContent } from "@/hooks/use-site-content";

const whyCards = [
  { icon: BookOpen, title: "Biblical Foundation", desc: "Every lesson is rooted in the Word of God" },
  { icon: Flame, title: "Spirit-Led Teaching", desc: "Guided by the Holy Spirit in every session" },
  { icon: Users, title: "Community & Fellowship", desc: "Learn alongside believers who share your calling" },
  { icon: Award, title: "Practical Ministry Training", desc: "Not just theory — real preparation for ministry life" },
];

const galleryImages = [
  "/images/som3.jpeg",
  "/images/som4.jpeg",
  "/images/som5.jpeg",
  "/images/som7.jpeg",
  "/images/som8.jpeg",
];

const About = () => {
  const { get } = useSiteContent("about");

  return (
    <div>
      {/* Hero banner */}
      <section className="relative py-20 sm:py-28 text-center text-primary-foreground">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/images/som2.jpeg)" }} />
        <div className="absolute inset-0 bg-primary/80" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 space-y-3">
          <Reveal>
            <h1 className="text-3xl sm:text-5xl font-extrabold">{get("hero_title", "About Spirit Life School of Ministry")}</h1>
            <p className="text-primary-foreground/80 text-lg italic">{get("hero_subtitle", '"Equipping The Saints..."')}</p>
          </Reveal>
        </div>
      </section>

      {/* About content */}
      <Reveal className="py-20 px-4 sm:px-6 bg-background">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary">{get("mission_title", "Our Mission")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {get("mission_text", "In a time like this, women, men and brethren who are genuinely called by God into Ministry need a platform where they can be thoroughly equipped with the accurate Word of God — to help them see clearly the call of God and how to embrace it. Spirit Life School of Ministry exists to be that platform. Rooted in Scripture and led by the Holy Spirit, we are committed to raising men and women who are grounded in biblical truth and prepared for effective service in God's vineyard.")}
            </p>
            <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground">
              <p>{get("mission_quote", '"Whoever wants to embrace the call of God in their life must go through thorough learning, teaching and furnishing" — Ephesians 4:12-13')}</p>
              <footer className="mt-2 text-sm font-semibold text-primary not-italic">
                {get("mission_quote_author", "— Prophet Cherub Obadare, Director")}
              </footer>
            </blockquote>
          </div>
          <div className="rounded-xl overflow-hidden shadow-lg">
            <img src="/images/som2.jpeg" alt="Spirit Life SOM Class" className="w-full h-auto object-cover" loading="lazy" />
          </div>
        </div>
      </Reveal>

      {/* Why Choose Us */}
      <Reveal className="py-20 px-4 sm:px-6 bg-secondary/50">
        <div className="max-w-6xl mx-auto text-center space-y-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary">{get("why_title", "Why Spirit Life SOM?")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyCards.map((c, i) => (
              <Reveal key={c.title} className="w-full" delay={i * 80}>
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-6 text-center space-y-4">
                    <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <c.icon className="text-primary" size={28} />
                    </div>
                    <h3 className="font-semibold text-lg text-foreground">{c.title}</h3>
                    <p className="text-muted-foreground text-sm">{c.desc}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      {/* History & Gallery */}
      <Reveal className="py-20 px-4 sm:px-6 bg-background">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary">{get("story_title", "Our Story")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {get("story_text", "Spirit Life School of Ministry was established by Spirit Life Cherubim and Seraphim Church, Ibadan, Nigeria, under the leadership of Prophet Cherub Obadare. Born out of a burden to see believers properly equipped for the work of ministry, the school was founded on the conviction that the call of God must be matched with thorough preparation. What began as a vision to train church members has grown into a full ministry training programme that has already seen its first cohort graduate and go on to serve effectively in God's vineyard. Today, Spirit Life SOM continues to equip a new generation of believers — physically and online — for ministry life.")}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {galleryImages.map((src, i) => (
              <Reveal key={src} delay={i * 60} className="rounded-lg overflow-hidden shadow-md aspect-square">
                <img src={src} alt={`SOM Gallery ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" loading="lazy" />
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default About;
