import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const ScrollToTop = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility, { passive: true });
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Rendered outside the router, so read the path directly. On phones the home
  // page pins an action bar to the bottom; sit above it rather than on it.
  const onHome = typeof window !== "undefined" && window.location.pathname === "/";

  return (
    <>
      {isVisible && (
        <Button
          onClick={scrollToTop}
          className={`fixed ${onHome ? "bottom-28 md:bottom-5" : "bottom-5"} left-5 z-50 h-11 w-11 rounded-full shadow-lg transition-all duration-300 hover:scale-110 print:hidden`}
          aria-label="Scroll to top"
          size="icon"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </>
  );
};

export default ScrollToTop;
