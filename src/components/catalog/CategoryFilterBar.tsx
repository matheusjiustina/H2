"use client";

import Link from "next/link";
import { categories } from "@/data/categories";

const FILTERS = [{ slug: "todos", shortName: "Todos" }, ...categories];

export function CategoryFilterBar({ active }: { active: string }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {FILTERS.map((filter) => {
        const isActive = filter.slug === active;
        const href = filter.slug === "todos" ? "/catalogo" : `/categoria/${filter.slug}`;
        return (
          <Link
            key={filter.slug}
            href={href}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-dark bg-dark text-white"
                : "border-line bg-white text-ink/80 hover:border-dark/40 hover:text-ink"
            }`}
          >
            {filter.shortName}
          </Link>
        );
      })}
    </div>
  );
}
