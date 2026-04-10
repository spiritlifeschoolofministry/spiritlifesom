import { Card, CardContent } from "@/components/ui/card";
import Reveal from "@/components/Reveal";

const faculty = [
  {
    initials: "CO",
    name: "Prophet Cherub Obadare",
    title: "Director, School of Ministry",
    bio: "A seasoned minister of the Gospel and leader of Spirit Life C&S Church, Prophet Obadare brings deep biblical insight and spiritual authority to guide students in their ministerial journey.",
    image: "PRO-CHERUB-IMG1.jpg",
  },
  {
    initials: "FO",
    name: "Pastor Folakemi Obadare",
    title: "Co-director",
    bio: "Pastor Folakemi Obadare serves alongside Prophet Cherub Obadare as Co-director of Spirit Life School of Ministry, offering nurturing leadership, spiritual care, and a heart for empowering students.",
  },
  {
    initials: "KO",
    name: "Prophet Kayode Olagunju",
    title: "School Coordinator",
    bio: "Prophet Olagunju oversees the academic and operational structure of the school, ensuring every student receives the support they need to thrive spiritually and academically.",
  },
];

const FacultyPage = () => (
  <div>
    {/* Hero */}
    <section className="relative py-20 sm:py-28 text-center text-primary-foreground">
      <div className="absolute inset-0 gradient-purple" />
      <div className="relative z-10 max-w-3xl mx-auto px-4 space-y-3">
        <Reveal>
          <h1 className="text-3xl sm:text-5xl font-extrabold">Meet Our Faculty</h1>
          <p className="text-primary-foreground/80 text-lg">Dedicated servants of God committed to equipping the saints</p>
        </Reveal>
      </div>
    </section>

    {/* Faculty cards */}
    <section className="py-20 px-4 sm:px-6 bg-background">
      <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {faculty.map((f, i) => (
          <Reveal key={f.name} delay={i * 120}>
            <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-8 text-center space-y-4">
                {f.image ? (
                  <img src={`/images/${f.image}`} alt={f.name} className="mx-auto w-24 h-24 rounded-full object-cover" />
                ) : (
                  <div className="mx-auto w-24 h-24 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-3xl font-bold">
                    {f.initials}
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
    </section>
  </div>
);

export default FacultyPage;
