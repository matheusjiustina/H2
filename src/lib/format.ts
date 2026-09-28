/** Prices are stored in BRL cents; `null` renders as "Consulte". */
export function formatPrice(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "Consulte";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
