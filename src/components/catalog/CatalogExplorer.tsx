"use client";

import { useMemo, useState } from "react";
import { ProductGrid } from "./ProductGrid";
import { categories } from "@/data/categories";
import type { Product } from "@/lib/types";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function matches(product: Product, query: string) {
  const haystack = normalize(
    [
      product.name,
      product.brand,
      product.model,
      product.storage ?? "",
      product.color ?? "",
      categories.find((c) => c.slug === product.category)?.name ?? "",
    ].join(" "),
  );
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function CatalogExplorer({
  products,
  initialQuery = "",
}: {
  products: Product[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    return products.filter((product) => matches(product, query));
  }, [products, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-light"
          >
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" />
            <path d="m20 20-3.6-3.6" stroke="currentColor" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Refinar por modelo, marca ou categoria..."
            aria-label="Refinar busca"
            className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-gray-light focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <p className="text-sm text-gray">
          {filtered.length} {filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}
        </p>
      </div>

      <ProductGrid products={filtered} />
    </div>
  );
}
