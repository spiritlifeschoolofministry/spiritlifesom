import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/use-site-content";
import SEO from "@/components/SEO";

const whyCards = [
  { title: "Biblical", desc: "Every lesson is rooted in the Word of God." },
  { title: "Spirit-led", desc: "Guided by the Holy Spirit in every session." },
  { title: "Community", desc: "Learn alongside believers who share your calling." },
  { title: "Practical", desc: "Not just theory: real preparation for ministry life." },
];

const outlineLink =
  "inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const galleryImages = [
  "/images/som3-800.webp",
  "/images/som4-800.webp",
  "/images/som5-800.webp",
  "/images/som7-800.webp",
  "/images/som8-800.webp",
];

const About = () => {
  const { get } = useSiteContent("about");

  return (
    <div className="bg-card">
      <SEO
        title="About SLSOM | Spirit Life School of Ministry"
        description="Learn about Spirit Life School of Ministry — our biblical foundation, Spirit-led teaching philosophy, community of believers and practical ministry training in Ibadan."
        path="/about"
        type="website"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About Spirit Life School of Ministry",
          url: "https://spiritlifesom.org/about",
        }}
      />
      {/* Hero: mission beside a class photo */}
      <section className="bg-background">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:flex-row lg:items-center lg:gap-12">
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight sm:text-[44px]">
              {get("hero_title", "About Spirit Life School of Ministry")}
            </h1>
            <p className="text-base italic text-muted-foreground">{get("hero_subtitle", '"Equipping The Saints..."')}</p>
            <h2 className="mt-2 text-lg font-bold">{get("mission_title", "Our Mission")}</h2>
            <p className="text-[17px] leading-relaxed text-foreground/85">
              {get("mission_text", "In a time like this, women, men and brethren who are genuinely called by God into Ministry need a platform where they can be thoroughly equipped with the accurate Word of God — to help them see clearly the call of God and how to embrace it. Spirit Life School of Ministry exists to be that platform. Rooted in Scripture and led by the Holy Spirit, we are committed to raising men and women who are grounded in biblical truth and prepared for effective service in God's vineyard.")}
            </p>
            <blockquote className="flex flex-col gap-1.5 border-l-4 border-[#E0A526] pl-4">
              <p className="text-[15px] italic leading-relaxed text-foreground/85">
                {get("mission_quote", '"Whoever wants to embrace the call of God in their life must go through thorough learning, teaching and furnishing" — Ephesians 4:12-13')}
              </p>
              <footer className="text-[15px] font-semibold text-muted-foreground">
                {get("mission_quote_author", "— Prophet Cherub Obadare, Director")}
              </footer>
            </blockquote>
          </div>
          <img
            src="/images/som2.webp"
            alt="A teaching session at Spirit Life School of Ministry"
            className="h-[260px] w-full min-w-0 rounded-3xl object-cover sm:h-[380px] lg:max-w-[480px] lg:flex-1"
          />
        </div>
      </section>

      {/* Why Spirit Life SOM */}
      <section>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-14 sm:px-6 sm:py-16">
          <h2 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">{get("why_title", "Why Spirit Life SOM?")}</h2>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {whyCards.map((c) => (
              <div key={c.title} className="flex flex-col gap-2 rounded-[18px] border border-border bg-card p-[22px]">
                <h3 className="text-lg font-bold tracking-tight">{c.title}</h3>
                <p className="text-[15px] leading-normal text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/courses" className={outlineLink}>See the courses</Link>
            <Link to="/faculty" className={outlineLink}>Meet the faculty</Link>
          </div>
        </div>
      </section>

      {/* Our story and gallery */}
      <section className="bg-background">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-14 sm:px-6 sm:py-16">
          <div className="flex max-w-3xl flex-col gap-3">
            <h2 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">{get("story_title", "Our Story")}</h2>
            <p className="text-base leading-relaxed text-foreground/85">
              {get("story_text", "Spirit Life School of Ministry was established by Spirit Life Cherubim and Seraphim Church, Ibadan, Nigeria, under the leadership of Prophet Cherub Obadare. Born out of a burden to see believers properly equipped for the work of ministry, the school was founded on the conviction that the call of God must be matched with thorough preparation. What began as a vision to train church members has grown into a full ministry training programme that has already seen its first cohort graduate and go on to serve effectively in God's vineyard. Today, Spirit Life SOM continues to equip a new generation of believers — physically and online — for ministry life.")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {galleryImages.map((src, i) => (
              <div key={src} className="aspect-square overflow-hidden rounded-[18px]">
                <img src={src} alt={`Spirit Life SOM gallery photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
