import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  className?: string;
  children: React.ReactNode;
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
  delay?: number;
};

const Reveal = ({
  className,
  children,
  threshold = 0.15,
  rootMargin = "0px 0px -10% 0px",
  once = true,
  delay = 0,
}: RevealProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once, visible]);

  return (
    <div
      ref={ref}
      className={cn(
        "transform transition-all duration-700 ease-out opacity-0 translate-y-8",
        visible && "opacity-100 translate-y-0",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

export default Reveal;
