import { CategoryIcon } from "./CategoryIcon";
import type { IconKey } from "@/lib/types";

const GRADIENTS: Record<IconKey, string> = {
  iphone: "from-slate-200 via-slate-100 to-accent-100",
  android: "from-emerald-100 via-slate-100 to-slate-200",
  tablet: "from-sky-100 via-slate-100 to-slate-200",
  macbook: "from-slate-200 via-slate-100 to-slate-50",
  notebook: "from-slate-200 via-zinc-100 to-slate-50",
  headphones: "from-violet-100 via-slate-100 to-slate-200",
  earbuds: "from-slate-200 via-slate-100 to-accent-100",
  speaker: "from-orange-100 via-slate-100 to-slate-200",
  case: "from-rose-100 via-slate-100 to-slate-200",
  charger: "from-amber-100 via-slate-100 to-slate-200",
  cable: "from-slate-200 via-slate-100 to-slate-50",
  watch: "from-slate-200 via-slate-100 to-accent-100",
  accessory: "from-teal-100 via-slate-100 to-slate-200",
  generic: "from-slate-200 via-slate-100 to-slate-50",
};

interface ProductVisualProps {
  icon: IconKey;
  label?: string;
  className?: string;
  iconClassName?: string;
  showCaption?: boolean;
}

export function ProductVisual({
  icon,
  label,
  className = "",
  iconClassName = "w-16 h-16",
  showCaption = true,
}: ProductVisualProps) {
  const gradient = GRADIENTS[icon] ?? GRADIENTS.generic;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${gradient} ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(#111 1px, transparent 1px), linear-gradient(90deg, #111 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-accent-400/25 blur-2xl" />
      <div className="relative flex h-[62%] w-[62%] max-h-40 max-w-40 items-center justify-center rounded-2xl bg-white/80 shadow-[0_8px_24px_-8px_rgba(17,17,17,0.18)] backdrop-blur-sm">
        <CategoryIcon icon={icon} className={`${iconClassName} text-dark/70`} />
      </div>
      {showCaption && (
        <span className="absolute bottom-2 left-2 rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray/70 backdrop-blur-sm">
          {label ?? "Imagem ilustrativa"}
        </span>
      )}
    </div>
  );
}
