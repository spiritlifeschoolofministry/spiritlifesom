import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import Reveal from "@/components/Reveal";
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
    <div>
      {/* Hero */}
      <section className="relative py-20 sm:py-28 text-center text-primary-foreground">
        <div className="absolute inset-0 gradient-purple" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 space-y-3">
          <Reveal>
            <h1 className="text-3xl sm:text-5xl font-extrabold">{get("hero_title", "Meet Our Faculty")}</h1>
            <p className="text-primary-foreground/80 text-lg">
              {get("hero_subtitle", "Dedicated servants of God committed to equipping the saints")}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Faculty cards */}
      <section className="py-20 px-4 sm:px-6 bg-background">
        {loading ? (
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : faculty.length === 0 ? (
          <p className="text-center text-muted-foreground">No faculty members listed yet.</p>
        ) : (
          <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {faculty.map((f, i) => (
              <Reveal key={f.id} delay={i * 120}>
                <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <CardContent className="p-8 text-center space-y-4">
                    {f.photo_url ? (
                      <img
                        src={f.photo_url}
                        alt={f.name}
                        className="mx-auto w-24 h-24 rounded-full object-cover"
                      />
                    ) : (
                      <div className="mx-auto w-24 h-24 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-3xl font-bold">
                        {initialsOf(f.name)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-xl text-foreground">{f.name}</h3>
                      <p className="text-sm text-accent font-medium mt-1">{f.title}</p>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">{f.bio}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default FacultyPage;
