import { Card, CardContent } from "@/components/ui/card";

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

const FacultyPage = () => (
  <div>
    {/* Hero */}
    <section className="relative py-20 sm:py-28 text-center text-primary-foreground">
      <div className="absolute inset-0 gradient-purple" />
      <div className="relative z-10 max-w-3xl mx-auto px-4 space-y-3">
        <h1 className="text-3xl sm:text-5xl font-extrabold">Meet Our Faculty</h1>
        <p className="text-primary-foreground/80 text-lg">Dedicated servants of God committed to equipping the saints</p>
      </div>
    </section>

    {/* Faculty cards */}
    <section className="py-20 px-4 sm:px-6 bg-background">
      <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {faculty.map((f) => (
          <Card key={f.name} className="border-0 shadow-md">
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto w-24 h-24 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-3xl font-bold">
                {f.initials}
              </div>
              <div>
                <h3 className="font-semibold text-xl text-foreground">{f.name}</h3>
                <p className="text-sm text-accent font-medium mt-1">{f.title}</p>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.bio}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  </div>
);

export default FacultyPage;
