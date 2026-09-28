import type { ReactNode } from "react";

const STYLES = {
  novo: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  seminovo: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  destaque: "bg-accent-100 text-accent-700 ring-1 ring-inset ring-accent-200",
  oferta: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  indisponivel: "bg-zinc-100 text-zinc-500 ring-1 ring-inset ring-zinc-200",
  neutro: "bg-white/90 text-ink ring-1 ring-inset ring-line",
} as const;

export type BadgeVariant = keyof typeof STYLES;

export function Badge({ variant = "neutro", children }: { variant?: BadgeVariant; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STYLES[variant]}`}
    >
      {children}
    </span>
  );
}
