import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Home = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-2xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-bold text-primary tracking-tight">
            Spirit Life School of Ministry
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground italic">
            "Equipping The Saints..."
          </p>
        </div>

        <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
          A Christian ministry training platform dedicated to raising equipped,
          spirit-filled believers for the work of ministry.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="gradient-flame border-0 text-accent-foreground hover:opacity-90 text-base px-8">
            <Link to="/register">Register</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 text-base px-8">
            <Link to="/login">Login</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Home;
