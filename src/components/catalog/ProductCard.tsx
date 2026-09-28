import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ProductVisual } from "@/components/ui/ProductVisual";
import { formatPrice } from "@/lib/format";
import { productWhatsAppLink } from "@/lib/whatsapp";
import type { Product } from "@/lib/types";
import { WhatsAppIcon } from "@/components/layout/WhatsAppIcon";

export function ProductCard({ product }: { product: Product }) {
  const mainInfo = [product.storage, product.model !== product.name ? product.model : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card)]">
      <Link href={`/produto/${product.id}`} className="relative block aspect-square w-full">
        <ProductVisual icon={product.icon} className="h-full w-full" />
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {product.featured && <Badge variant="destaque">Destaque</Badge>}
          {product.oldPrice != null && <Badge variant="oferta">Oferta</Badge>}
          <Badge variant={product.condition === "novo" ? "novo" : "seminovo"}>
            {product.condition === "novo" ? "Novo" : "Seminovo"}
          </Badge>
        </div>
        {!product.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <Badge variant="indisponivel">Consulte disponibilidade</Badge>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-light">{product.brand}</p>
        <Link href={`/produto/${product.id}`}>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-ink transition-colors group-hover:text-accent-700">
            {product.name}
          </h3>
        </Link>
        {mainInfo && <p className="text-sm text-gray">{mainInfo}</p>}

        <div className="mt-1 flex items-baseline gap-2">
          {product.oldPrice != null && (
            <span className="text-sm text-gray-light line-through">{formatPrice(product.oldPrice)}</span>
          )}
          <span className="text-lg font-semibold text-ink">{formatPrice(product.price)}</span>
        </div>

        <div className="mt-auto flex gap-2 pt-3">
          <Link
            href={`/produto/${product.id}`}
            className="flex-1 rounded-full border border-line px-3 py-2 text-center text-sm font-semibold text-ink transition-colors hover:border-dark hover:bg-dark hover:text-white"
          >
            Ver detalhes
          </Link>
          <a
            href={productWhatsAppLink(product)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Chamar no WhatsApp sobre ${product.name}`}
            className="flex items-center justify-center rounded-full bg-[#25D366] px-3 py-2 text-white transition-transform hover:scale-105"
          >
            <WhatsAppIcon className="h-4.5 w-4.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
