import Link from "next/link";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Container } from "@/components/ui/Container";
import { WhatsAppIcon } from "@/components/layout/WhatsAppIcon";
import { genericWhatsAppLink } from "@/lib/whatsapp";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-dark text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10%] h-96 w-96 rounded-full bg-accent-600/30 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-[28rem] w-[28rem] rounded-full bg-accent-500/20 blur-3xl" />
        <div className="bg-grid absolute inset-0 opacity-[0.05]" />
      </div>

      <Container className="relative flex flex-col items-center gap-10 py-16 text-center sm:py-20 lg:flex-row lg:items-center lg:gap-16 lg:py-28 lg:text-left">
        <div className="flex flex-1 flex-col items-center lg:items-start">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80">
            📍 Paranaíta — MT
          </span>
          <h1 className="text-balance max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Seu próximo <span className="text-accent-400">iPhone</span> está aqui.
          </h1>
          <p className="mt-5 max-w-md text-lg font-medium text-white/80">
            iPhones, tecnologia e acessórios em um só lugar.
          </p>
          <p className="mt-3 max-w-md text-sm text-white/55">
            Encontre o aparelho que combina com você e fale diretamente com a H2iStore em Paranaíta.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/categoria/iphones"
              className="rounded-full bg-white px-6 py-3.5 text-center text-sm font-semibold text-dark shadow-lg transition-transform hover:scale-[1.03]"
            >
              Ver iPhones
            </Link>
            <Link
              href="/catalogo"
              className="rounded-full border border-white/25 px-6 py-3.5 text-center text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ver catálogo
            </Link>
            <a
              href={genericWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.03]"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Chamar no WhatsApp
            </a>
          </div>
        </div>

        <div className="relative flex w-full max-w-sm flex-1 items-center justify-center lg:max-w-md">
          <div className="relative flex h-72 w-full items-center justify-center sm:h-80">
            <div className="absolute h-56 w-56 rounded-full bg-accent-500/25 blur-3xl sm:h-64 sm:w-64" />
            {[
              { rotate: "-rotate-6", translate: "-translate-x-16 sm:-translate-x-24", z: "z-10", opacity: "opacity-90" },
              { rotate: "rotate-0", translate: "translate-x-0", z: "z-20", opacity: "opacity-100" },
              { rotate: "rotate-6", translate: "translate-x-16 sm:translate-x-24", z: "z-10", opacity: "opacity-90" },
            ].map((card, i) => (
              <div
                key={i}
                className={`absolute ${card.z} ${card.translate} ${card.rotate} ${card.opacity} flex h-56 w-28 items-center justify-center rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/15 to-white/5 shadow-2xl backdrop-blur-sm sm:h-64 sm:w-32`}
              >
                <CategoryIcon icon="iphone" className="h-14 w-14 text-white/70 sm:h-16 sm:w-16" />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
