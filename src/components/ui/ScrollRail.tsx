"use client";

import { useRef, type ReactNode } from "react";

export function ScrollRail({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    ref.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        className={`no-scrollbar snap-x-rail flex gap-4 overflow-x-auto scroll-pl-4 pb-2 ${className}`}
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-16 bg-gradient-to-l from-bg to-transparent sm:block" />
      <button
        type="button"
        onClick={() => scrollBy(-320)}
        aria-label="Rolar para a esquerda"
        className="absolute -left-4 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white p-2 shadow-md transition-transform hover:scale-105 sm:flex"
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} className="h-4 w-4">
          <path d="m15 6-6 6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => scrollBy(320)}
        aria-label="Rolar para a direita"
        className="absolute -right-4 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white p-2 shadow-md transition-transform hover:scale-105 sm:flex"
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} className="h-4 w-4">
          <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
