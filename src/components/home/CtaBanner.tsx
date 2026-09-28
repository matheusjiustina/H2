import { Container } from "@/components/ui/Container";
import { WhatsAppIcon } from "@/components/layout/WhatsAppIcon";
import { genericWhatsAppLink } from "@/lib/whatsapp";

export function CtaBanner() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-accent-700 via-accent-600 to-accent-500 py-14 text-white sm:py-16">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.08]" />
      <Container className="relative flex flex-col items-center gap-5 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Encontrou o que procura?
        </h2>
        <p className="max-w-lg text-white/85">
          Chame a H2iStore no WhatsApp e consulte disponibilidade, valores e condições.
        </p>
        <a
          href={genericWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-accent-700 shadow-lg transition-transform hover:scale-[1.03]"
        >
          <WhatsAppIcon className="h-4.5 w-4.5" />
          Falar agora
        </a>
      </Container>
    </section>
  );
}
