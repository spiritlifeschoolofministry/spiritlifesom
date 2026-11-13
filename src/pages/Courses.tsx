import { Link } from "react-router-dom";
import { Check, Clock } from "lucide-react";
import { useSiteContent } from "@/hooks/use-site-content";
import SEO from "@/components/SEO";
import { basicCourses, advancedCourses, type CurriculumCourse } from "@/data/courses";

const CoursesPage = () => {
  const { get } = useSiteContent("courses");

  return (
    <div className="bg-card">
      <SEO
        title="Courses & Curriculum | Spirit Life School of Ministry"
        description="Explore SLSOM's Basic and Advanced ministry curriculum — 19 courses covering scripture, theology, leadership, pastoral care, evangelism and ministerial ethics."
        path="/courses"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Spirit Life School of Ministry — Courses",
          url: "https://spiritlifesom.org/courses",
        }}
      />
      {/* Hero */}
      <section className="bg-background">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2.5 px-4 pb-10 pt-12 sm:px-6 sm:pt-14">
          <h1 className="text-[34px] font-extrabold tracking-tight sm:text-[44px]">{get("hero_title", "The curriculum")}</h1>
          <p className="max-w-[680px] text-[17px] leading-relaxed text-muted-foreground sm:text-lg">
            {get(
              "hero_subtitle",
              `${basicCourses.length + advancedCourses.length} courses in two modules, covering Scripture, theology, leadership, pastoral care, evangelism and ministerial ethics.`,
            )}
          </p>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 pb-[72px] pt-10 sm:px-6">
        <ModuleSection
          title={get("basic_title", "Basic Module")}
          desc={get("basic_desc", "A foundational programme designed to ground you in scripture, ministry principles, and spiritual maturity. Perfect for new ministers and those seeking deeper understanding.")}
          courses={basicCourses}
          status="Now enrolling"
          tagClass="bg-secondary text-secondary-foreground"
        />
        <ModuleSection
          title={get("advanced_title", "Advanced Module")}
          desc={get("advanced_desc", "An in-depth programme for graduates of the Basic Module. Dive deeper into theology, pastoral practice, and leadership for effective ministry.")}
          courses={advancedCourses}
          status="Coming soon"
          statusIcon
          tagClass="bg-[#FBF3DE] text-[#6B4A06]"
        />

        {/* Tuition & fees */}
        <section className="flex flex-col gap-[18px]" aria-labelledby="tuition-heading">
          <h2 id="tuition-heading" className="text-2xl font-extrabold tracking-tight sm:text-[28px]">
            {get("tuition_title", "Tuition & Fees")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-5 rounded-[20px] border border-border bg-card p-6 sm:p-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Physical</p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight">{get("physical_price", "FREE")}</p>
              </div>
              <ul className="flex flex-col gap-2.5 text-[15px] text-muted-foreground">
                {["Weekly Saturday classes (9AM - 12PM)", "In-person lectures and practicals", "Access to course materials (fee applies)", "Project defense and graduation"].map((f) => (
                  <li key={f} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-primary dark:text-foreground" aria-hidden="true" />{f}</li>
                ))}
              </ul>
              <Link
                to="/register"
                className="mt-auto inline-flex min-h-12 items-center justify-center rounded-xl border-[1.5px] border-primary px-5 font-bold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:text-foreground"
              >
                Apply free
              </Link>
            </div>
            <div className="flex flex-col gap-5 rounded-[20px] bg-[#17112B] p-6 text-white sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.06em] text-white/75">Online</p>
                  <p className="mt-1 text-4xl font-extrabold tracking-tight">{get("online_price", "₦30,000")}</p>
                </div>
                <span className="rounded-full bg-[#E0A526] px-3 py-1 text-xs font-bold text-[#17112B]">Most popular</span>
              </div>
              <ul className="flex flex-col gap-2.5 text-[15px] text-white/85">
                {["Live Zoom sessions every Saturday", "Full training materials included", "Class recordings access", "Must attend physically for project defense and graduation"].map((f) => (
                  <li key={f} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-[#E0A526]" aria-hidden="true" />{f}</li>
                ))}
              </ul>
              <Link
                to="/register"
                className="mt-auto inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-5 font-bold text-[#17112B] transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17112B]"
              >
                Apply now
              </Link>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-[#17112B] px-6 py-[22px] text-white">
          <span className="text-[17px] font-semibold">Start with the Basic Module.</span>
          <Link
            to="/register"
            className="inline-flex min-h-11 items-center rounded-xl bg-[#E0A526] px-[22px] font-bold text-[#17112B] transition-colors hover:bg-[#F3C969] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17112B]"
          >
            Apply now
          </Link>
        </div>
      </div>
    </div>
  );
};

const ModuleSection = ({
  title,
  desc,
  courses,
  status,
  statusIcon,
  tagClass,
}: {
  title: string;
  desc: string;
  courses: CurriculumCourse[];
  status: string;
  statusIcon?: boolean;
  tagClass: string;
}) => (
  <section className="flex flex-col gap-[18px]">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex max-w-[720px] flex-col gap-1.5">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h2>
        <p className="text-base leading-normal text-muted-foreground">{desc}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted-foreground">
        <span>{courses.length} courses</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold">
          {statusIcon && <Clock className="h-3 w-3" aria-hidden="true" />}
          {status}
        </span>
      </div>
    </div>
    <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {courses.map((c) => (
        <li key={c.code} className="flex items-center gap-3.5 rounded-[14px] border border-border bg-card px-[18px] py-4">
          <span className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-bold ${tagClass}`}>{c.code}</span>
          <span className="text-[15px] font-medium leading-snug">{c.title}</span>
        </li>
      ))}
    </ul>
  </section>
);

export default CoursesPage;
