import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { ProductVisual } from "@/components/ui/ProductVisual";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { WhatsAppIcon } from "@/components/layout/WhatsAppIcon";
import { getCategory } from "@/data/categories";
import { getProductById, getRelatedProducts, products } from "@/data/products";
import { formatPrice } from "@/lib/format";
import { productWhatsAppLink } from "@/lib/whatsapp";

export function generateStaticParams() {
  return products.map((product) => ({ id: product.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) return {};

  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/produto/${product.id}` },
    openGraph: {
      title: `${product.name} — H2iStore`,
      description: product.description,
    },
  };
}

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) notFound();

  const category = getCategory(product.category);
  const related = getRelatedProducts(product, 4);

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-gray">
          <Link href="/" className="hover:text-ink">
            Início
          </Link>
          <span>/</span>
          <Link href="/catalogo" className="hover:text-ink">
            Catálogo
          </Link>
          {category && (
            <>
              <span>/</span>
              <Link href={`/categoria/${category.slug}`} className="hover:text-ink">
                {category.name}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl">
            <ProductVisual icon={product.icon} className="h-full w-full" iconClassName="w-28 h-28" />
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              {product.featured && <Badge variant="destaque">Destaque</Badge>}
              {product.oldPrice != null && <Badge variant="oferta">Oferta</Badge>}
              <Badge variant={product.condition === "novo" ? "novo" : "seminovo"}>
                {product.condition === "novo" ? "Novo" : "Seminovo"}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-gray-light">{product.brand}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{product.name}</h1>
              {category && <p className="mt-1 text-sm text-gray">{category.name}</p>}
            </div>

            <div className="flex items-baseline gap-3">
              {product.oldPrice != null && (
                <span className="text-lg text-gray-light line-through">{formatPrice(product.oldPrice)}</span>
              )}
              <span className="text-3xl font-semibold text-ink">{formatPrice(product.price)}</span>
            </div>

            <p className="text-base leading-relaxed text-gray">{product.description}</p>

            <div className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">Especificações</h2>
              <dl className="mt-3 flex flex-col divide-y divide-line">
                {product.specifications.map((spec) => (
                  <div key={spec.label} className="flex items-center justify-between py-2 text-sm">
                    <dt className="text-gray">{spec.label}</dt>
                    <dd className="font-medium text-ink">{spec.value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 text-sm">
                  <dt className="text-gray">Disponibilidade</dt>
                  <dd className="font-medium text-ink">
                    {product.available ? "Consultar com a equipe" : "Consulte disponibilidade"}
                  </dd>
                </div>
              </dl>
            </div>

            <a
              href={productWhatsAppLink(product)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-4 text-base font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]"
            >
              <WhatsAppIcon className="h-5 w-5" />
              Tenho interesse — falar no WhatsApp
            </a>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-20">
            <SectionHeading title="Você também pode gostar" />
            <div className="mt-6">
              <ProductGrid products={related} />
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
