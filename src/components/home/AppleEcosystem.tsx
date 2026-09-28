import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Reveal } from "@/components/ui/Reveal";
import type { IconKey } from "@/lib/types";

const ECOSYSTEM_ITEMS: { label: string; icon: IconKey; href: string }[] = [
  { label: "iPhone", icon: "iphone", href: "/categoria/iphones" },
  { label: "iPad", icon: "tablet", href: "/categoria/ipads" },
  { label: "MacBook", icon: "macbook", href: "/categoria/macbooks" },
  { label: "AirPods", icon: "earbuds", href: "/categoria/fones" },
  { label: "Apple Watch", icon: "watch", href: "/categoria/outros" },
  { label: "Acessórios", icon: "accessory", href: "/categoria/acessorios" },
];

export function AppleEcosystem({ compact = false }: { compact?: boolean }) {
  return (
    <section className="bg-dark py-16 text-white sm:py-20">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Apple"
            title="Ecossistema Apple"
            description="A H2iStore é o seu ponto de acesso ao mundo Apple em Paranaíta — do iPhone aos acessórios."
            align="center"
            tone="dark"
          />
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {ECOSYSTEM_ITEMS.map((item, index) => (
            <Reveal key={item.label} delay={index * 40}>
              <Link
                href={item.href}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-accent-400/50 hover:bg-white/10"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white transition-colors group-hover:bg-accent-500">
                  <CategoryIcon icon={item.icon} className="h-7 w-7" />
                </span>
                <span className="text-sm font-semibold">{item.label}</span>
              </Link>
            </Reveal>
          ))}
        </div>

        {!compact && (
          <p className="mx-auto mt-8 max-w-lg text-center text-sm text-white/50">
            Novos produtos do ecossistema Apple serão adicionados conforme a disponibilidade real na loja.
          </p>
        )}
      </Container>
    </section>
  );
}
