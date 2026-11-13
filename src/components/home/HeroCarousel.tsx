import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The home page photo carousel. A native scroll-snap track, so a phone swipes
 * it like any other carousel, with dots and a gentle auto-advance.
 *
 * Only the first photo is in the DOM at first (it is the page's largest paint);
 * once it has loaded, the photo after the current one joins, so the next one is
 * always ready and the rest load only when reached. Auto-advance waits for that
 * first photo, pauses while the visitor is touching or hovering the photos or
 * the tab is hidden, and is off for people who ask for reduced motion.
 */

export interface HeroSlide {
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

const ADVANCE_MS = 6000;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const HeroCarousel = ({ slides = HERO_SLIDES }: { slides?: HeroSlide[] }) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(0);
  const [mounted, setMounted] = useState<number[]>([0]);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const n = slides.length;

  // Once the first photo is in, keep the current one and the next one mounted.
  useEffect(() => {
    if (!firstLoaded) return;
    const want = [current, (current + 1) % n];
    setMounted((prev) => (want.every((i) => prev.includes(i)) ? prev : Array.from(new Set([...prev, ...want]))));
  }, [current, firstLoaded, n]);

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    const target = track?.children[i] as HTMLElement | undefined;
    const first = track?.children[0] as HTMLElement | undefined;
    if (track && target && first) {
      track.scrollTo?.({ left: target.offsetLeft - first.offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
    setCurrent(i);
  }, []);

  // Which slide is showing, from the scroll position (swipes, keyboard, dots).
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.children.length === 0) return;
    const base = (track.children[0] as HTMLElement).offsetLeft;
    let best = 0;
    let bestDistance = Infinity;
    Array.from(track.children).forEach((child, i) => {
      const distance = Math.abs((child as HTMLElement).offsetLeft - base - track.scrollLeft);
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    if (best !== current) setCurrent(best);
  };

  useEffect(() => {
    if (!firstLoaded || paused || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      goTo((current + 1) % n);
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [current, firstLoaded, paused, goTo, n]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Photos from the school"
      className="flex min-w-0 flex-col gap-1"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.name}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}`}
            className="relative h-[250px] shrink-0 basis-[85%] snap-start overflow-hidden rounded-[22px] bg-primary/20 md:h-[340px] md:basis-[62%] lg:h-[480px] lg:basis-full"
          >
            {mounted.includes(i) && (
              <img
                src={`/images/${slide.name}.webp`}
                srcSet={`/images/${slide.name}-800.webp 800w, /images/${slide.name}.webp 1439w`}
                sizes="(min-width: 1024px) 660px, (min-width: 768px) 62vw, 85vw"
                alt={slide.alt}
                width={1439}
                height={957}
                fetchPriority={i === 0 ? "high" : "low"}
                decoding={i === 0 ? undefined : "async"}
                onLoad={i === 0 ? () => setFirstLoaded(true) : undefined}
                // Don't strand the carousel on a photo that failed to load.
                onError={i === 0 ? () => setFirstLoaded(true) : undefined}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover",
                  i === current && "motion-safe:animate-ken-burns",
                )}
              />
            )}
            {/* The school's purple wash, as on the previous home page. */}
            <div aria-hidden="true" className="absolute inset-0 bg-primary/35" />
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        {slides.map((slide, i) => (
          <button
            key={slide.name}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show photo ${i + 1} of ${n}`}
            aria-current={i === current ? "true" : undefined}
            className="flex h-11 w-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className={cn(
                "block h-2 rounded-full transition-all duration-300",
                i === current ? "w-[22px] bg-primary" : "w-2 bg-primary/25",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default HeroCarousel;
