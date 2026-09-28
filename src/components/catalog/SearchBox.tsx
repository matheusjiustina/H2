"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SearchBox({
  className = "",
  compact = false,
  placeholder = "O que você está procurando?",
  autoFocus = false,
}: {
  className?: string;
  compact?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const query = value.trim();
    router.push(query ? `/catalogo?q=${encodeURIComponent(query)}` : "/catalogo");
  }

  return (
    <form onSubmit={handleSubmit} className={`relative w-full ${className}`} role="search">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.8}
        className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-light"
      >
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" />
        <path d="m20 20-3.6-3.6" stroke="currentColor" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Buscar produtos"
        className={`w-full rounded-full border border-line bg-white text-ink placeholder:text-gray-light focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 ${
          compact ? "py-2 pl-10 pr-3 text-sm" : "py-3 pl-11 pr-4 text-sm"
        }`}
      />
    </form>
  );
}
