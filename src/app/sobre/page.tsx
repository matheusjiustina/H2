import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { CtaBanner } from "@/components/home/CtaBanner";
import { categories } from "@/data/categories";

export const metadata: Metadata = {
  title: "Sobre",
  description: "Conheça a H2iStore — tecnologia, smartphones e acessórios em Paranaíta, MT.",
  alternates: { canonical: "/sobre" },
};

const STEPS = [
  {
    title: "1. Explore o site",
    description: "Navegue pelas categorias ou use a busca para encontrar o produto ideal.",
  },
  {
    title: "2. Confira os detalhes",
    description: "Veja especificações, condição e informações disponíveis de cada produto.",
  },
  {
    title: "3. Fale no WhatsApp",
    description: "Consulte disponibilidade, preço e condições diretamente com a nossa equipe.",
  },
];

export default function SobrePage() {
  return (
    <div className="pb-4">
      <section className="bg-white py-14 sm:py-20">
        <Container className="max-w-2xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Sobre</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">H2iStore</h1>
          <p className="mt-5 text-lg text-gray">
            Tecnologia, smartphones e acessórios em Paranaíta. A H2iStore conecta você aos produtos que procura
            com atendimento próximo, simples e direto.
          </p>
          <p className="mt-4 text-base text-gray">
            Apesar do forte foco em iPhones e no ecossistema Apple, a H2iStore trabalha com uma variedade muito
            maior de tecnologia: outros smartphones, iPads, MacBooks, notebooks de diversas marcas, fones de
            ouvido, caixas de som JBL, capinhas, carregadores, cabos e outros acessórios.
          </p>
        </Container>
      </section>

      <section className="bg-bg py-14 sm:py-16">
        <Container>
          <SectionHeading eyebrow="Catálogo" title="O que você encontra na H2iStore" align="center" />
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {categories.map((category) => (
              <div
                key={category.slug}
                className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-4 text-center"
              >
                <CategoryIcon icon={category.icon} className="h-6 w-6 text-accent-600" />
                <span className="text-xs font-medium text-ink">{category.shortName}</span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-white py-14 sm:py-16">
        <Container>
          <SectionHeading eyebrow="Como funciona" title="Site + WhatsApp" align="center" />
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.title} className="rounded-2xl border border-line bg-bg p-5">
                <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm text-gray">{step.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <CtaBanner />
    </div>
  );
}
