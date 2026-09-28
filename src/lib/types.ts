export type ProductCategorySlug =
  | "iphones"
  | "celulares"
  | "ipads"
  | "macbooks"
  | "notebooks"
  | "fones"
  | "jbl"
  | "capinhas"
  | "acessorios"
  | "outros";

export type ProductCondition = "novo" | "seminovo";

export type IconKey =
  | "iphone"
  | "android"
  | "tablet"
  | "macbook"
  | "notebook"
  | "headphones"
  | "earbuds"
  | "speaker"
  | "case"
  | "charger"
  | "cable"
  | "watch"
  | "accessory"
  | "generic";

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategorySlug;
  model: string;
  storage?: string;
  condition: ProductCondition;
  color?: string;
  /** Price in BRL cents. `null` means "Consulte" (price on request). */
  price: number | null;
  /** Previous price in BRL cents, shown struck-through when present. */
  oldPrice?: number | null;
  featured: boolean;
  /** Recently added to the catalog — powers the "Chegou na H2iStore" rail. */
  justArrived?: boolean;
  available: boolean;
  icon: IconKey;
  description: string;
  specifications: ProductSpec[];
  relatedIds?: string[];
}

export interface Category {
  slug: ProductCategorySlug;
  name: string;
  shortName: string;
  tagline: string;
  icon: IconKey;
}
