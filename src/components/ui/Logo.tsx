import Image from "next/image";

type LogoVariant = "full" | "lockup" | "icon";

const SOURCES: Record<LogoVariant, { src: string; width: number; height: number }> = {
  full: { src: "/brand/logo-full.webp", width: 1212, height: 772 },
  lockup: { src: "/brand/logo-lockup.webp", width: 1236, height: 894 },
  icon: { src: "/brand/logo-icon.webp", width: 920, height: 649 },
};

export function Logo({
  variant = "full",
  height = 40,
  priority = false,
  className = "",
  onDark = false,
}: {
  variant?: LogoVariant;
  height?: number;
  priority?: boolean;
  className?: string;
  onDark?: boolean;
}) {
  const { src, width, height: naturalHeight } = SOURCES[variant];
  const computedWidth = Math.round((width / naturalHeight) * height);

  const image = (
    <Image
      src={src}
      alt="H2iStore — Seu Mundo Apple"
      width={computedWidth}
      height={height}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );

  if (!onDark) return image;

  return (
    <span
      className="inline-flex items-center rounded-xl bg-white shadow-sm"
      style={{ padding: Math.max(6, Math.round(height * 0.16)) }}
    >
      {image}
    </span>
  );
}
