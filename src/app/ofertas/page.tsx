import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { OfertasSection } from "@/components/home/OfertasSection";
import { products } from "@/data/products";

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Ofertas e condições especiais da H2iStore em Paranaíta, MT.",
  alternates: { canonical: "/ofertas" },
};

export default function OfertasPage() {
  const offers = products.filter((p) => p.oldPrice != null && p.available);

  return (
    <div className="py-10 sm:py-14">
      <Container>
        <SectionHeading
          eyebrow="Promoções"
          title="Ofertas"
          description="Preços anteriores riscados aparecem automaticamente quando um produto entra em promoção."
        />
      </Container>
      <div className="mt-6">
        <OfertasSection offers={offers} showLinkToFullPage={false} />
      </div>
    </div>
  );
}
