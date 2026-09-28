import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { AppleEcosystem } from "@/components/home/AppleEcosystem";
import { ProductRailSection } from "@/components/home/ProductRailSection";
import { CtaBanner } from "@/components/home/CtaBanner";
import { products } from "@/data/products";

export const metadata: Metadata = {
  title: "Ecossistema Apple",
  description:
    "iPhone, iPad, MacBook, AirPods, Apple Watch e acessórios na H2iStore, em Paranaíta, MT.",
  alternates: { canonical: "/apple" },
};

const APPLE_CATEGORIES = ["iphones", "ipads", "macbooks", "fones"];

export default function ApplePage() {
  const appleFeatured = products.filter(
    (p) => APPLE_CATEGORIES.includes(p.category) && p.brand === "Apple" && p.featured,
  );

  return (
    <div className="pb-10">
      <section className="bg-white py-14 text-center sm:py-16">
        <Container className="max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">H2iStore</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Seu Mundo Apple em Paranaíta
          </h1>
          <p className="mt-4 text-base text-gray">
            A H2iStore é o seu ponto de acesso aos produtos Apple na região — iPhone, iPad, MacBook, AirPods e
            acessórios, com atendimento direto pelo WhatsApp.
          </p>
        </Container>
      </section>

      <AppleEcosystem />

      <ProductRailSection
        eyebrow="Seleção Apple"
        title="Produtos Apple em destaque"
        description="Uma seleção do ecossistema Apple disponível na H2iStore."
        products={appleFeatured}
        ctaHref="/catalogo"
        ctaLabel="Ver catálogo completo"
        tone="muted"
      />

      <CtaBanner />
    </div>
  );
}
