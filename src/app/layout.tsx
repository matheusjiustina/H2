import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFloat } from "@/components/layout/WhatsAppFloat";
import { siteConfig } from "@/lib/site-config";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: `${siteConfig.legalDescription} iPhones, iPads, MacBooks, notebooks, fones, JBL, capinhas e acessórios. Consulte pelo WhatsApp.`,
  keywords: [
    "H2iStore",
    "iPhone Paranaíta",
    "loja de iPhone MT",
    "assistência Apple Paranaíta",
    "smartphones Paranaíta",
    "notebooks Paranaíta",
    "JBL Paranaíta",
    "acessórios celular Paranaíta",
  ],
  authors: [{ name: siteConfig.name }],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.legalDescription,
    url: siteConfig.url,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: siteConfig.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.legalDescription,
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
  manifest: "/site.webmanifest",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ElectronicsStore",
  name: siteConfig.name,
  description: siteConfig.legalDescription,
  url: siteConfig.url,
  image: `${siteConfig.url}/og-image.png`,
  telephone: `+${siteConfig.whatsappE164}`,
  address: {
    "@type": "PostalAddress",
    addressLocality: siteConfig.city,
    addressRegion: siteConfig.state,
    addressCountry: "BR",
  },
  sameAs: [siteConfig.instagramUrl],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <WhatsAppFloat />
      </body>
    </html>
  );
}
