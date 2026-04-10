import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, BookOpen, GraduationCap } from "lucide-react";
import Reveal from "@/components/Reveal";

const basicCourses = [
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

const advancedCourses = [
  { code: "SLSM201", title: "Advanced Hermeneutics" },
  { code: "SLSM202", title: "Systematic Theology" },
  { code: "SLSM203", title: "Pastoral Counseling" },
  { code: "SLSM204", title: "Church Administration & Governance" },
  { code: "SLSM205", title: "Missions & Evangelism Strategy" },
  { code: "SLSM206", title: "Homiletics & Sermon Delivery" },
  { code: "SLSM207", title: "Spiritual Warfare & Deliverance" },
  { code: "SLSM208", title: "Christian Education & Discipleship" },
];

const CoursesPage = () => (
  <div>
    {/* Hero */}
    <section className="relative py-20 sm:py-28 text-center text-primary-foreground">
      <div className="absolute inset-0 gradient-purple" />
      <div className="relative z-10 max-w-3xl mx-auto px-4 space-y-3">
        <Reveal>
          <h1 className="text-3xl sm:text-5xl font-extrabold">Our Programme</h1>
          <p className="text-primary-foreground/80 text-lg">Equipping believers for ministry — 2025/26 Academic Session</p>
        </Reveal>
      </div>
    </section>

    <section className="py-16 sm:py-20 px-4 sm:px-6 bg-background">
      <div className="max-w-6xl mx-auto space-y-16">

        {/* ── Basic Module ── */}
        <div className="space-y-6">
          <Reveal>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-primary" />
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Basic Module</h2>
              </div>
              <Badge variant="secondary" className="w-fit text-xs">11 Courses • Now Enrolling</Badge>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <p className="text-muted-foreground max-w-2xl">
              A foundational programme designed to ground you in scripture, ministry principles, and spiritual maturity. Perfect for new ministers and those seeking deeper understanding.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {basicCourses.map((c, i) => (
              <Reveal key={c.code} delay={80 + i * 40}>
                <Card className="border-primary/20 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  <CardContent className="p-5 flex items-start gap-3">
                    <span className="text-xs font-bold text-accent whitespace-nowrap">{c.code}</span>
                    <span className="text-sm font-medium text-foreground">{c.title}</span>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ── Advanced Module ── */}
        <div className="space-y-6">
          <Reveal>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-muted-foreground" />
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Advanced Module</h2>
              </div>
              <Badge variant="outline" className="w-fit text-xs gap-1.5 border-muted-foreground/30 text-muted-foreground">
                <Clock className="w-3 h-3" />
                Coming Soon
              </Badge>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <p className="text-muted-foreground max-w-2xl">
              An in-depth programme for graduates of the Basic Module. Dive deeper into theology, pastoral practice, and leadership for effective ministry.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
            {advancedCourses.map((c, i) => (
              <Reveal key={c.code} delay={80 + i * 40}>
                <Card className="border-border bg-muted/30">
                  <CardContent className="p-5 flex items-start gap-3">
                    <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">{c.code}</span>
                    <span className="text-sm font-medium text-muted-foreground">{c.title}</span>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ── Pricing ── */}
        <div className="space-y-6">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center">Tuition & Fees</h2>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Physical */}
            <Reveal delay={80}>
              <Card className="border-primary/30 relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
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
            </Reveal>

            {/* Online */}
            <Reveal delay={160}>
              <Card className="border-0 gradient-flame text-primary-foreground relative overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
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
            </Reveal>
          </div>
        </div>

        {/* CTA */}
        <Reveal>
          <div className="text-center">
            <Button asChild size="lg" className="gradient-flame border-0 text-primary-foreground text-base px-10 hover:opacity-90">
              <Link to="/register">Register Now</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  </div>
);

export default CoursesPage;
