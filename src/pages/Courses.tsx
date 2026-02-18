import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";

const courses = [
  { code: "SLSM101", title: "The Canon of Scriptures" },
  { code: "SLSM102", title: "The Basic Bible Interpretation" },
  { code: "SLSM103", title: "The Basic Bible Doctrines" },
  { code: "SLSM104", title: "The Concept of Ministry" },
  { code: "SLSM105", title: "Spiritual Maturing" },
  { code: "SLSM106", title: "The Principle of Honor" },
  { code: "SLSM107", title: "Church Conflict Management & Resolution" },
  { code: "SLSM108", title: "The Biblical Concept of Leadership" },
  { code: "SLSM109", title: "Ministerial Ethics" },
  { code: "SLSM110", title: "Balancing Marriage and Ministry" },
  { code: "SLSM111", title: "Ministry and Marketplace" },
];

const CoursesPage = () => (
  <div>
    {/* Hero */}
    <section className="relative py-20 sm:py-28 text-center text-primary-foreground">
      <div className="absolute inset-0 gradient-purple" />
      <div className="relative z-10 max-w-3xl mx-auto px-4 space-y-3">
        <h1 className="text-3xl sm:text-5xl font-extrabold">Our Programme</h1>
        <p className="text-primary-foreground/80 text-lg">Basic Programme — 2025/26 Academic Session</p>
      </div>
    </section>

    {/* Course grid */}
    <section className="py-20 px-4 sm:px-6 bg-background">
      <div className="max-w-6xl mx-auto space-y-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <Card key={c.code} className="border-primary/20 hover:border-primary/40 transition-colors">
              <CardContent className="p-5 flex items-start gap-3">
                <span className="text-xs font-bold text-accent whitespace-nowrap">{c.code}</span>
                <span className="text-sm font-medium text-foreground">{c.title}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pricing */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Physical */}
          <Card className="border-primary/30 relative">
            <CardContent className="p-8 space-y-6">
              <div>
                <p className="text-sm font-semibold text-primary uppercase tracking-wide">Physical</p>
                <p className="text-4xl font-extrabold text-foreground mt-1">FREE</p>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {[
                  "Weekly Saturday classes (9AM - 12PM)",
                  "In-person lectures and practicals",
                  "Access to course materials (fee applies)",
                  "Project defense and graduation",
                ].map((f) => (
                  <li key={f} className="flex gap-2"><Check size={16} className="text-primary shrink-0 mt-0.5" />{f}</li>
                ))}
              </ul>
              <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary/10">
                <Link to="/register">Register Free</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Online */}
          <Card className="border-0 gradient-flame text-primary-foreground relative overflow-hidden shadow-xl">
            <div className="absolute top-4 right-4 bg-primary-foreground/20 text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
              Most Popular
            </div>
            <CardContent className="p-8 space-y-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary-foreground/90">Online</p>
                <p className="text-4xl font-extrabold mt-1">₦30,000</p>
              </div>
              <ul className="space-y-3 text-sm text-primary-foreground/90">
                {[
                  "Live Zoom sessions every Saturday",
                  "Full training materials included",
                  "Class recordings access",
                  "Must attend physically for project defense and graduation",
                ].map((f) => (
                  <li key={f} className="flex gap-2"><Check size={16} className="shrink-0 mt-0.5" />{f}</li>
                ))}
              </ul>
              <Button asChild className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold">
                <Link to="/register">Register Now</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button asChild size="lg" className="gradient-flame border-0 text-primary-foreground text-base px-10 hover:opacity-90">
            <Link to="/register">Register Now</Link>
          </Button>
        </div>
      </div>
    </section>
  </div>
);

export default CoursesPage;
