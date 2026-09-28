import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { ProductRail } from "@/components/catalog/ProductRail";
import { products } from "@/data/products";

export function JblSection() {
  const jblProducts = products.filter((p) => p.category === "jbl");
  if (jblProducts.length === 0) return null;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-white py-16 sm:py-20">
      <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
      <Container className="relative">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">JBL</p>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Som para qualquer momento
            </h2>
            <p className="mt-2 max-w-md text-base text-gray">
              Caixas de som e fones JBL para levar a sua trilha sonora para onde você for.
            </p>
          </div>
        </Reveal>

        <div className="mt-8">
          <ProductRail products={jblProducts} />
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/categoria/jbl"
            className="rounded-full bg-dark px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            Ver linha JBL
          </Link>
        </div>
      </Container>
    </section>
  );
}
