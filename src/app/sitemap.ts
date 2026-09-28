import type { MetadataRoute } from "next";
import { categories } from "@/data/categories";
import { products } from "@/data/products";
import { siteConfig } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/catalogo",
    "/apple",
    "/ofertas",
    "/sobre",
    "/contato",
  ].map((path) => ({
    url: `${siteConfig.url}${path}`,
    lastModified: new Date(),
  }));

  const categoryRoutes = categories.map((category) => ({
    url: `${siteConfig.url}/categoria/${category.slug}`,
    lastModified: new Date(),
  }));

  const productRoutes = products.map((product) => ({
    url: `${siteConfig.url}/produto/${product.id}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
