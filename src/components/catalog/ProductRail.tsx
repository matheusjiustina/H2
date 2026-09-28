import { ScrollRail } from "@/components/ui/ScrollRail";
import { ProductCard } from "./ProductCard";
import type { Product } from "@/lib/types";

export function ProductRail({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <ScrollRail>
      {products.map((product) => (
        <div key={product.id} className="snap-item w-[46vw] shrink-0 sm:w-56 lg:w-64">
          <ProductCard product={product} />
        </div>
      ))}
    </ScrollRail>
  );
}
