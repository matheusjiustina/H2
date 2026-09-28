import type { Category } from "@/lib/types";

export const categories: Category[] = [
  {
    slug: "iphones",
    name: "iPhones",
    shortName: "iPhones",
    tagline: "O protagonista da H2iStore",
    icon: "iphone",
  },
  {
    slug: "celulares",
    name: "Outros Celulares",
    shortName: "Celulares",
    tagline: "Mais marcas, mais opções",
    icon: "android",
  },
  {
    slug: "ipads",
    name: "iPads",
    shortName: "iPads",
    tagline: "Tela grande, produtividade total",
    icon: "tablet",
  },
  {
    slug: "macbooks",
    name: "MacBooks",
    shortName: "MacBooks",
    tagline: "Performance com a maçã",
    icon: "macbook",
  },
  {
    slug: "notebooks",
    name: "Notebooks",
    shortName: "Notebooks",
    tagline: "Diversas marcas para todo uso",
    icon: "notebook",
  },
  {
    slug: "fones",
    name: "Fones e Áudio",
    shortName: "Fones",
    tagline: "AirPods, bluetooth e mais",
    icon: "headphones",
  },
  {
    slug: "jbl",
    name: "JBL",
    shortName: "JBL",
    tagline: "Som para qualquer momento",
    icon: "speaker",
  },
  {
    slug: "capinhas",
    name: "Capinhas",
    shortName: "Capinhas",
    tagline: "Proteção com estilo",
    icon: "case",
  },
  {
    slug: "acessorios",
    name: "Acessórios",
    shortName: "Acessórios",
    tagline: "Carregadores, cabos e mais",
    icon: "charger",
  },
  {
    slug: "outros",
    name: "Outros Produtos",
    shortName: "Outros",
    tagline: "Mais tecnologia pra você",
    icon: "generic",
  },
];

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}
