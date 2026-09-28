import { ProductCard } from "./ProductCard";
import type { Product } from "@/lib/types";

export function ProductGrid({ products, emptyMessage }: { products: Product[]; emptyMessage?: string }) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-16 text-center">
        <p className="text-base font-medium text-ink">
          {emptyMessage ?? "Nenhum produto encontrado."}
        </p>
        <p className="mt-1 text-sm text-gray">Tente outra busca ou fale com a nossa equipe no WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
