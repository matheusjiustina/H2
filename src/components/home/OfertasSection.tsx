import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { ProductRail } from "@/components/catalog/ProductRail";
import { WhatsAppIcon } from "@/components/layout/WhatsAppIcon";
import { genericWhatsAppLink } from "@/lib/whatsapp";
import type { Product } from "@/lib/types";

export function OfertasSection({
  offers,
  showLinkToFullPage = true,
}: {
  offers: Product[];
  showLinkToFullPage?: boolean;
}) {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Promoções"
            title="Ofertas"
            description="Produtos com condições especiais aparecem aqui assim que estiverem disponíveis."
            align="center"
          />
        </Reveal>

        {offers.length > 0 ? (
          <div className="mt-8">
            <ProductRail products={offers} />
          </div>
        ) : (
          <Reveal delay={80}>
            <div className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-bg px-6 py-12 text-center">
              <p className="text-base font-medium text-ink">Nenhuma oferta ativa no momento.</p>
              <p className="text-sm text-gray">
                Fale com a H2iStore no WhatsApp e consulte condições especiais para o produto que você procura.
              </p>
              <a
                href={genericWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Consultar no WhatsApp
              </a>
            </div>
          </Reveal>
        )}

        {showLinkToFullPage && offers.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Link
              href="/ofertas"
              className="rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-dark hover:bg-dark hover:text-white"
            >
              Ver todas as ofertas
            </Link>
          </div>
        )}
      </Container>
    </section>
  );
}
