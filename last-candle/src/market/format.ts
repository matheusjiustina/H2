export const fmtUsd = (v: number, signed = false): string => {
  const sign = v < 0 ? "-" : signed && v > 0 ? "+" : "";
  const a = Math.abs(v);
  const s = a >= 100000 ? a.toLocaleString("en-US", { maximumFractionDigits: 0 }) : a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}$${s}`;
};

export const fmtPrice = (v: number, decimals: number): string => {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
};

export const fmtPct = (v: number, digits = 2): string => {
  const p = v * 100;
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(p).toFixed(digits)}%`;
};

export const fmtVol = (v: number): string => {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
};

/** Minute-of-day → "03:14". */
export const fmtClock = (minuteOfDay: number): string => {
  const m = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
};
