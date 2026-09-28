"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades content in as it scrolls into view. Renders fully visible by
 * default (SSR, no-JS, or already-in-viewport on mount) so nothing is
 * ever hidden from crawlers or users without a working IntersectionObserver
 * — the animation is a progressive enhancement, never a requirement to see
 * the content.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"visible" | "pending" | "animate">("visible");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setState((current) => {
          if (entry.isIntersecting) return "animate";
          return current === "visible" ? "pending" : current;
        });
        if (entry.isIntersecting) observer.disconnect();
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${state === "pending" ? "opacity-0" : ""} ${state === "animate" ? "animate-fade-up" : ""} ${className}`}
      style={state === "animate" ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
