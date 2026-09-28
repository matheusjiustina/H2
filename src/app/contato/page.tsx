import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { WhatsAppIcon } from "@/components/layout/WhatsAppIcon";
import { siteConfig } from "@/lib/site-config";
import { genericWhatsAppLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a H2iStore pelo WhatsApp ou Instagram. Loja em Paranaíta, MT.",
  alternates: { canonical: "/contato" },
};

export default function ContatoPage() {
  return (
    <div className="py-10 sm:py-14">
      <Container className="max-w-4xl">
        <SectionHeading eyebrow="Contato" title="Fale com a H2iStore" align="center" />

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
              <WhatsAppIcon className="h-6 w-6" />
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">WhatsApp</h3>
            <p className="text-sm text-gray">{siteConfig.whatsappDisplay}</p>
            <a
              href={genericWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              Abrir WhatsApp
            </a>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 text-accent-700">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-6 w-6">
                <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="currentColor" />
                <circle cx="12" cy="12" r="4.3" stroke="currentColor" />
                <circle cx="17.4" cy="6.6" r="1" fill="currentColor" />
              </svg>
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Instagram</h3>
            <p className="text-sm text-gray">{siteConfig.instagramHandle}</p>
            <a
              href={siteConfig.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-dark hover:bg-dark hover:text-white"
            >
              Seguir no Instagram
            </a>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-dark/5 text-dark">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-6 w-6">
                <path
                  d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="9.5" r="2.4" stroke="currentColor" />
              </svg>
            </span>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Local</h3>
            <p className="text-sm text-gray">
              {siteConfig.city} — {siteConfig.state}
            </p>
          </div>
        </div>

        <div className="mt-12">
          <SectionHeading eyebrow="Localização" title="H2iStore em Paranaíta — MT" />
          <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:flex-row sm:items-center">
            <div className="flex h-32 w-full shrink-0 items-center justify-center rounded-xl bg-bg text-gray-light sm:w-48">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.3} className="h-10 w-10">
                <path
                  d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="9.5" r="2.4" stroke="currentColor" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Endereço completo em breve.</p>
              <p className="mt-1 text-sm text-gray">
                {/* TODO: inserir endereço oficial da loja assim que for fornecido pela H2iStore. */}
                Por enquanto, fale com a nossa equipe pelo WhatsApp para saber como chegar até a H2iStore em
                Paranaíta — MT.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
