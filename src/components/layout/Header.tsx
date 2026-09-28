"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { SearchBox } from "@/components/catalog/SearchBox";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { genericWhatsAppLink } from "@/lib/whatsapp";

const NAV_LINKS = [
  { href: "/", label: "Início" },
  { href: "/categoria/iphones", label: "iPhones" },
  { href: "/categoria/celulares", label: "Celulares" },
  { href: "/apple", label: "Apple" },
  { href: "/categoria/notebooks", label: "Notebooks" },
  { href: "/categoria/acessorios", label: "Acessórios" },
  { href: "/ofertas", label: "Ofertas" },
  { href: "/sobre", label: "Sobre" },
  { href: "/contato", label: "Contato" },
];

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b transition-colors duration-200 ${
        scrolled ? "border-line bg-white/90 backdrop-blur-md" : "border-transparent bg-white/70 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center" aria-label="H2iStore — início">
          <Logo variant="full" height={34} priority />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-dark text-white" : "text-ink/80 hover:bg-dark/5 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden w-48 xl:block">
          <SearchBox compact />
        </div>

        <a
          href={genericWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden shrink-0 items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.03] lg:inline-flex"
        >
          <WhatsAppIcon className="h-4 w-4" />
          Falar no WhatsApp
        </a>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-dark/5 lg:hidden"
        >
          {menuOpen ? (
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} className="h-6 w-6">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} className="h-6 w-6">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <div className="fixed inset-x-0 top-[61px] z-30 h-[calc(100vh-61px)] overflow-y-auto bg-white lg:hidden">
          <div className="flex flex-col gap-6 px-5 py-6">
            <SearchBox autoFocus />
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`rounded-xl px-4 py-3 text-base font-medium ${
                      active ? "bg-dark text-white" : "text-ink hover:bg-bg"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <a
              href={genericWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-3.5 text-base font-semibold text-white shadow-sm"
            >
              <WhatsAppIcon className="h-5 w-5" />
              Falar no WhatsApp
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
