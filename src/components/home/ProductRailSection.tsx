import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { ProductRail } from "@/components/catalog/ProductRail";
import type { Product } from "@/lib/types";

export function ProductRailSection({
  eyebrow,
  title,
  description,
  products,
  ctaHref,
  ctaLabel,
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  products: Product[];
  ctaHref?: string;
  ctaLabel?: string;
  tone?: "light" | "muted";
}) {
  if (products.length === 0) return null;

  return (
    <section className={`py-16 sm:py-20 ${tone === "muted" ? "bg-bg" : "bg-white"}`}>
      <Container>
        <Reveal>
          <SectionHeading eyebrow={eyebrow} title={title} description={description} />
        </Reveal>
        <div className="mt-8">
          <ProductRail products={products} />
        </div>
        {ctaHref && ctaLabel && (
          <div className="mt-8 flex justify-center">
            <Link
              href={ctaHref}
              className="rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-dark hover:bg-dark hover:text-white"
            >
              {ctaLabel}
            </Link>
          </div>
        )}
      </Container>
    </section>
  );
}
