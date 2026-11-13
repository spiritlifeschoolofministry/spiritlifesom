import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * The home page hero: full-screen photos that cross-fade under the headline.
 * Each photo carries the school's purple wash, and a dark fade at the bottom
 * keeps the white text on top readable on any photo.
 *
 * Only the first photo is in the DOM at first (it is the page's largest paint);
 * once it has loaded, the photo after the current one joins, so the next one is
 * always ready and the rest load only when reached. It advances every 4 seconds
 * once the first photo is in, pauses while something inside has keyboard focus
 * or the tab is hidden, and stays still for people who ask for reduced motion.
 * On touch screens a sideways swipe moves to the next or previous photo.
 */

interface HeroSlide {
  /** Base name under /images; each has a 1439px and an 800px WebP. */
  name: string;
  alt: string;
}

const HERO_SLIDES: HeroSlide[] = [
  { name: "som3", alt: "Graduands being prayed over at their commissioning" },
  { name: "som4", alt: "A graduating class with their certificates and the director" },
  { name: "som5", alt: "The director with a guest at the graduation service" },
  { name: "som7", alt: "A graduate holding a certificate of completion beside the director" },
  { name: "som8", alt: "A graduate and a lecturer holding a certificate of completion" },
  { name: "som1", alt: "A graduate being presented with a gift on stage" },
  { name: "som2", alt: "Two graduates holding a certificate of completion" },
];

const ADVANCE_MS = 4000;
const SWIPE_PX = 40;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const HeroCarousel = ({
  children,
  sectionRef,
}: {
  children: ReactNode;
  /** Lets the page watch when the hero has scrolled away. */
  sectionRef?: RefObject<HTMLElement | null>;
}) => {
  const slides = HERO_SLIDES;
  const n = slides.length;
  const [current, setCurrent] = useState(0);
  const [mounted, setMounted] = useState<number[]>([0]);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const touchX = useRef<number | null>(null);

  // Once the first photo is in, keep the current one and the next one mounted.
  useEffect(() => {
    if (!firstLoaded) return;
    const want = [current, (current + 1) % n];
    setMounted((prev) => (want.every((i) => prev.includes(i)) ? prev : Array.from(new Set([...prev, ...want]))));
  }, [current, firstLoaded, n]);

  const goTo = useCallback((i: number) => setCurrent(((i % n) + n) % n), [n]);

  // Restarts on every change, so a swipe or a dot gets a full 4 seconds too.
  useEffect(() => {
    if (!firstLoaded || focusInside || prefersReducedMotion()) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "hidden") goTo(current + 1);
    }, ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [current, firstLoaded, focusInside, goTo]);

  return (
    <section
      ref={sectionRef}
      aria-roledescription="carousel"
      aria-label="Photos from the school"
      className="relative isolate flex h-[calc(100svh-60px)] max-h-[920px] min-h-[540px] items-end overflow-hidden bg-[#17112B] lg:h-[calc(100svh-72px)]"
      onFocusCapture={() => setFocusInside(true)}
      onBlurCapture={() => setFocusInside(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start == null || end == null || Math.abs(end - start) < SWIPE_PX) return;
        goTo(end < start ? current + 1 : current - 1);
      }}
    >
      {slides.map((slide, i) => (
        <div
          key={slide.name}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${n}`}
          aria-hidden={i !== current}
          className={cn(
            "absolute inset-0 -z-10 transition-opacity duration-1000 ease-in-out",
            i === current ? "opacity-100" : "opacity-0",
          )}
        >
          {mounted.includes(i) && (
            <img
              src={`/images/${slide.name}.webp`}
              srcSet={`/images/${slide.name}-800.webp 800w, /images/${slide.name}.webp 1439w`}
              sizes="100vw"
              alt={slide.alt}
              width={1439}
              height={957}
              fetchPriority={i === 0 ? "high" : "low"}
              decoding={i === 0 ? undefined : "async"}
              onLoad={i === 0 ? () => setFirstLoaded(true) : undefined}
              // Don't strand the slideshow on a photo that failed to load.
              onError={i === 0 ? () => setFirstLoaded(true) : undefined}
              className={cn(
                "h-full w-full object-cover object-[50%_30%]",
                i === current && "motion-safe:animate-ken-burns",
              )}
            />
          )}
        </div>
      ))}

      {/* The school's purple wash, as on the previous home page, then a dark
          fade from the bottom so the text reads on every photo. */}
      <div aria-hidden="true" data-testid="hero-wash" className="absolute inset-0 -z-10 bg-primary/40" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-[#17112B] via-[#17112B]/45 to-[#17112B]/10" />

      <div className="w-full">{children}</div>

      {/* Bottom right on phones; centred from tablet up, clear of the floating
          WhatsApp button in the bottom-right corner. */}
      <div className="absolute bottom-4 right-3 z-10 flex md:bottom-5 md:left-1/2 md:right-auto md:-translate-x-1/2">
        {slides.map((slide, i) => (
          <button
            key={slide.name}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show photo ${i + 1} of ${n}`}
            aria-current={i === current ? "true" : undefined}
            className="flex h-11 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E0A526]"
          >
            <span
              aria-hidden="true"
              className={cn(
                "block h-1.5 rounded-full transition-all duration-300",
                i === current ? "w-6 bg-[#E0A526]" : "w-1.5 bg-white/55",
              )}
            />
          </button>
        ))}
      </div>
    </section>
  );
};

export default HeroCarousel;
