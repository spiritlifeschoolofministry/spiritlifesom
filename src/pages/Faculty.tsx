import { useEffect, useState } from "react";
import { useSiteContent } from "@/hooks/use-site-content";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import SEO from "@/components/SEO";

interface FacultyMember {
  id: string;
  name: string;
  title: string;
  bio: string;
  photo_url: string | null;
}

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const FacultyPage = () => {
  const { get } = useSiteContent("faculty");
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("faculty_members")
        .select("id,name,title,bio,photo_url")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      setFaculty(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="bg-card">
      <SEO
        title="Faculty | Spirit Life School of Ministry"
        description="Meet the faculty of Spirit Life School of Ministry — pastors, scholars and ministers equipping the next generation of Christian leaders."
        path="/faculty"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "SLSOM Faculty",
          url: "https://spiritlifesom.org/faculty",
        }}
      />
      {/* Hero */}
      <section className="bg-background">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2.5 px-4 pb-10 pt-12 sm:px-6 sm:pt-14">
          <h1 className="text-[34px] font-extrabold tracking-tight sm:text-[44px]">{get("hero_title", "Meet Our Faculty")}</h1>
          <p className="text-[17px] text-muted-foreground sm:text-lg">
            {get("hero_subtitle", "Dedicated servants of God committed to equipping the saints")}
          </p>
        </div>
      </section>

      {/* Faculty cards */}
      <div className="mx-auto max-w-[1200px] px-4 pb-[72px] pt-10 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-10" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Loading faculty</span>
          </div>
        ) : faculty.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No faculty members listed yet.</p>
        ) : (
          <ul className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {faculty.map((f) => (
              <li key={f.id} className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-card">
                {f.photo_url ? (
                  <img src={f.photo_url} alt={f.name} className="h-[220px] w-full object-cover object-top" loading="lazy" />
                ) : (
                  <div
                    className="flex h-[220px] items-center justify-center bg-secondary text-5xl font-extrabold text-secondary-foreground"
                    aria-hidden="true"
                  >
                    {initialsOf(f.name)}
                  </div>
                )}
                <div className="flex flex-col gap-1.5 p-[18px]">
                  <h2 className="text-lg font-bold tracking-tight">{f.name}</h2>
                  <p className="text-sm font-semibold text-primary dark:text-foreground">{f.title}</p>
                  <p className="text-sm leading-normal text-muted-foreground">{f.bio}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FacultyPage;
