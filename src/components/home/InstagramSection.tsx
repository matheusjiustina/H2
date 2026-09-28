import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { siteConfig } from "@/lib/site-config";

function InstagramGlyph({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5.5" stroke="currentColor" />
      <circle cx="12" cy="12" r="4.3" stroke="currentColor" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" />
    </svg>
  );
}

export function InstagramSection() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Redes sociais"
            title="Acompanhe a H2iStore"
            description={`${siteConfig.instagramHandle} no Instagram`}
            align="center"
          />
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-2 sm:gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-line bg-bg text-gray-light"
            >
              <InstagramGlyph className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-md text-center text-xs text-gray-light">
          As publicações reais do Instagram da H2iStore aparecerão aqui em breve.
        </p>

        <div className="mt-8 flex justify-center">
          <a
            href={siteConfig.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-dark hover:bg-dark hover:text-white"
          >
            <InstagramGlyph className="h-4 w-4" />
            Seguir no Instagram
          </a>
        </div>
      </Container>
    </section>
  );
}
