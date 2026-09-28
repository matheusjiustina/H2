import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";

export function AboutPreview() {
  return (
    <section className="bg-bg py-16 sm:py-20">
      <Container className="max-w-3xl text-center">
        <Reveal>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-600">Sobre</p>
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">H2iStore</h2>
          <p className="mt-4 text-base text-gray">
            Tecnologia, smartphones e acessórios em Paranaíta. A H2iStore conecta você aos produtos que procura
            com atendimento próximo, simples e direto — de iPhones a notebooks, áudio e acessórios.
          </p>
          <Link
            href="/sobre"
            className="mt-6 inline-flex rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-dark hover:bg-dark hover:text-white"
          >
            Conheça a H2iStore
          </Link>
        </Reveal>
      </Container>
    </section>
  );
}
