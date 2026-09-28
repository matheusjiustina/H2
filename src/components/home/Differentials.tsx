import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";

const ITEMS = [
  {
    title: "Atendimento local",
    description: "Fale diretamente com a nossa equipe.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-6 w-6">
        <path
          d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 0 2 2h1v-5H5a1 1 0 0 0-1 1zM20 15a2 2 0 0 1-2 2h-1v-5h2a1 1 0 0 1 1 1zM9 19c0 1.1 1.34 2 3 2s3-.9 3-2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Variedade",
    description: "Smartphones, informática, áudio e acessórios.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-6 w-6">
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" />
      </svg>
    ),
  },
  {
    title: "Praticidade",
    description: "Encontre no site e negocie pelo WhatsApp.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-6 w-6">
        <path
          d="M12 3.5c-4.7 0-8.5 3.4-8.5 7.6 0 2.2 1 4.2 2.7 5.6-.1.9-.5 2.1-1.4 3 1.5.1 3-.4 4.2-1.2 1 .3 2 .5 3 .5 4.7 0 8.5-3.4 8.5-7.6s-3.8-7.9-8.5-7.9Z"
          stroke="currentColor"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Tecnologia",
    description: "Produtos para diferentes estilos e necessidades.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-6 w-6">
        <path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7Z" stroke="currentColor" strokeLinejoin="round" />
        <path d="M12 12v9.5M3.8 7.2 12 12l8.2-4.8" stroke="currentColor" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function Differentials() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="Por que a H2iStore" title="Diferenciais" align="center" />
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item, index) => (
            <Reveal key={item.title} delay={index * 60}>
              <div className="flex h-full flex-col items-center gap-3 rounded-2xl border border-line bg-bg p-6 text-center transition-shadow hover:shadow-[var(--shadow-card)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                  {item.icon}
                </span>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">{item.title}</h3>
                <p className="text-sm text-gray">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
