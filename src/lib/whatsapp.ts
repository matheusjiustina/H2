import { siteConfig } from "./site-config";
import type { Product } from "./types";

function buildLink(message: string) {
  return `https://wa.me/${siteConfig.whatsappE164}?text=${encodeURIComponent(message)}`;
}

export function genericWhatsAppMessage() {
  return "Olá, H2iStore! Gostaria de saber mais sobre os produtos disponíveis.";
}

export function productWhatsAppMessage(product: Pick<Product, "name">) {
  return `Olá, H2iStore! Vi este produto no site e tenho interesse no ${product.name}. Gostaria de saber disponibilidade, preço e condições.`;
}

export function categoryWhatsAppMessage(categoryName: string) {
  return `Olá, H2iStore! Estou procurando opções em ${categoryName}. Pode me ajudar?`;
}

export function genericWhatsAppLink() {
  return buildLink(genericWhatsAppMessage());
}

export function productWhatsAppLink(product: Pick<Product, "name">) {
  return buildLink(productWhatsAppMessage(product));
}

export function categoryWhatsAppLink(categoryName: string) {
  return buildLink(categoryWhatsAppMessage(categoryName));
}
