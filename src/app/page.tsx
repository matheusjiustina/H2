import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { ProductRailSection } from "@/components/home/ProductRailSection";
import { AppleEcosystem } from "@/components/home/AppleEcosystem";
import { JblSection } from "@/components/home/JblSection";
import { OfertasSection } from "@/components/home/OfertasSection";
import { Differentials } from "@/components/home/Differentials";
import { CtaBanner } from "@/components/home/CtaBanner";
import { InstagramSection } from "@/components/home/InstagramSection";
import { AboutPreview } from "@/components/home/AboutPreview";
import { products } from "@/data/products";

export const metadata: Metadata = {
  title: "H2iStore — Seu Mundo Apple em Paranaíta, MT",
  description:
    "iPhones, smartphones, iPads, MacBooks, notebooks, fones, JBL, capinhas e acessórios em Paranaíta, MT. Consulte disponibilidade e fale direto pelo WhatsApp.",
  alternates: { canonical: "/" },
};

export default function Home() {
  const iphones = products.filter((p) => p.category === "iphones");
  const destaques = products.filter((p) => p.featured && p.category !== "iphones");
  const novidades = products.filter((p) => p.justArrived);
  const seminovos = products.filter((p) => p.condition === "seminovo" && p.available);
  const ofertas = products.filter((p) => p.oldPrice != null && p.available);

  return (
    <>
      <Hero />
      <CategoryShowcase />

      <ProductRailSection
        eyebrow="iPhones"
        title="iPhones em destaque"
        description="Os modelos mais procurados da H2iStore."
        products={iphones}
        ctaHref="/categoria/iphones"
        ctaLabel="Ver todos os iPhones"
      />

      <ProductRailSection
        eyebrow="Seleção"
        title="Destaques da H2iStore"
        description="Uma seleção de produtos escolhidos pela nossa equipe."
        products={destaques}
        tone="muted"
      />

      <ProductRailSection
        eyebrow="Recém-chegados"
        title="Chegou na H2iStore"
        description="Os últimos produtos adicionados ao nosso catálogo."
        products={novidades}
      />

      <AppleEcosystem compact />

      <JblSection />

      <ProductRailSection
        eyebrow="Seminovos"
        title="Seminovos selecionados"
        description="Aparelhos com procedência verificada pela H2iStore. Saúde da bateria, garantia e itens inclusos disponíveis mediante consulta."
        products={seminovos}
        tone="muted"
      />

      <OfertasSection offers={ofertas} />

      <Differentials />
      <CtaBanner />
      <InstagramSection />
      <AboutPreview />
    </>
  );
}
