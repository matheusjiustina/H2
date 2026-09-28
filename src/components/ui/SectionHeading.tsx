import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  action,
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  action?: ReactNode;
  tone?: "light" | "dark";
}) {
  const isCenter = align === "center";
  const isDark = tone === "dark";
  return (
    <div
      className={`flex flex-col gap-3 ${isCenter ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between"}`}
    >
      <div className={isCenter ? "max-w-2xl" : ""}>
        {eyebrow && (
          <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? "text-accent-400" : "text-accent-600"}`}>
            {eyebrow}
          </p>
        )}
        <h2
          className={`text-balance text-2xl font-semibold tracking-tight sm:text-3xl ${isDark ? "text-white" : "text-ink"}`}
        >
          {title}
        </h2>
        {description && (
          <p className={`mt-2 text-base ${isDark ? "text-white/60" : "text-gray"}`}>{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
