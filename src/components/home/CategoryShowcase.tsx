import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Reveal } from "@/components/ui/Reveal";
import { categories } from "@/data/categories";

export function CategoryShowcase() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Catálogo" title="Explore nossa loja" align="center" />

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {categories.map((category, index) => (
            <Reveal key={category.slug} delay={index * 40}>
              <Link
                href={`/categoria/${category.slug}`}
                className="group flex h-full flex-col items-center gap-3 rounded-2xl border border-line bg-bg p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-accent-200 hover:bg-white hover:shadow-[var(--shadow-card)]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-dark shadow-sm transition-colors group-hover:bg-accent-600 group-hover:text-white">
                  <CategoryIcon icon={category.icon} className="h-7 w-7" />
                </span>
                <span className="text-sm font-semibold text-ink">{category.shortName}</span>
                <span className="text-xs text-gray">{category.tagline}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
