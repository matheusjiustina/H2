import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { categories } from "@/data/categories";
import { siteConfig } from "@/lib/site-config";
import { WhatsAppIcon } from "./WhatsAppIcon";

const FOOTER_CATEGORY_SLUGS = [
  "iphones",
  "celulares",
  "ipads",
  "macbooks",
  "notebooks",
  "jbl",
  "fones",
  "capinhas",
  "acessorios",
];

const QUICK_LINKS = [
  { href: "/", label: "Início" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/ofertas", label: "Ofertas" },
  { href: "/apple", label: "Ecossistema Apple" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

export function Footer() {
  const year = new Date().getFullYear();
  const footerCategories = FOOTER_CATEGORY_SLUGS.map((slug) => categories.find((c) => c.slug === slug)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );

  return (
    <footer className="border-t border-white/10 bg-dark text-white">
      <Container className="grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-1">
          <Logo variant="full" height={38} onDark />
          <p className="text-sm text-white/60">
            {siteConfig.tagline} · {siteConfig.city} — {siteConfig.state}
          </p>
          <p className="max-w-xs text-sm text-white/50">
            Smartphones, informática, áudio e acessórios em um só lugar. Fale com a nossa equipe pelo WhatsApp.
          </p>
          <a
            href={siteConfig.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6} className="h-4 w-4">
              <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" />
              <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" />
            </svg>
            {siteConfig.instagramHandle}
          </a>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">Categorias</h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {footerCategories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/categoria/${category.slug}`}
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  {category.shortName}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">Links</h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-white/60 transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">Contato</h3>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-white/60">
            <li className="flex items-center gap-2">
              <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
              {siteConfig.whatsappDisplay}
            </li>
            <li>{siteConfig.instagramHandle}</li>
            <li>
              {siteConfig.city} — {siteConfig.state}, {siteConfig.country}
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10 py-6">
        <Container className="flex flex-col items-center justify-between gap-3 text-xs text-white/45 sm:flex-row">
          <p>© {year} H2iStore. Todos os direitos reservados.</p>
          <p>Paranaíta — MT</p>
        </Container>
      </div>
    </footer>
  );
}
