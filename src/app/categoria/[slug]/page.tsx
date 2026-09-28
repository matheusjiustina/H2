import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryFilterBar } from "@/components/catalog/CategoryFilterBar";
import { CatalogExplorer } from "@/components/catalog/CatalogExplorer";
import { categories, getCategory } from "@/data/categories";
import { products } from "@/data/products";

export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) return {};

  return {
    title: category.name,
    description: `${category.name} na H2iStore em Paranaíta, MT. ${category.tagline}. Consulte disponibilidade pelo WhatsApp.`,
    alternates: { canonical: `/categoria/${category.slug}` },
  };
}

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const category = getCategory(slug);
  if (!category) notFound();

  const categoryProducts = products.filter((p) => p.category === category.slug);
  const allUnavailable = categoryProducts.length > 0 && categoryProducts.every((p) => !p.available);

  return (
    <div className="py-10 sm:py-14">
      <Container className="flex flex-col gap-8">
        <SectionHeading eyebrow="Categoria" title={category.name} description={category.tagline} />
        <CategoryFilterBar active={category.slug} />

        {allUnavailable && (
          <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-4 text-sm text-gray">
            Estrutura de catálogo em preparação para esta categoria. Fale com a H2iStore no WhatsApp para
            consultar disponibilidade atual.
          </div>
        )}

        <CatalogExplorer products={categoryProducts} initialQuery={q ?? ""} />
      </Container>
    </div>
  );
}
