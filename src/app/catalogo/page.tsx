import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryFilterBar } from "@/components/catalog/CategoryFilterBar";
import { CatalogExplorer } from "@/components/catalog/CatalogExplorer";
import { products } from "@/data/products";

export const metadata: Metadata = {
  title: "Catálogo completo",
  description:
    "Catálogo completo da H2iStore: iPhones, celulares, iPads, MacBooks, notebooks, fones, JBL, capinhas e acessórios.",
  alternates: { canonical: "/catalogo" },
};

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <div className="py-10 sm:py-14">
      <Container className="flex flex-col gap-8">
        <SectionHeading
          eyebrow="Catálogo"
          title="Encontre o que você procura"
          description="Navegue por todas as categorias da H2iStore ou use a busca para refinar o resultado."
        />
        <CategoryFilterBar active="todos" />
        <CatalogExplorer products={products} initialQuery={q ?? ""} />
      </Container>
    </div>
  );
}
