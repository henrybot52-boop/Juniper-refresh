import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Juniper Floral Studio | Luxury Floral Design in Hamilton",
  description:
    "Artisanal floral design studio in Hamilton, Ontario. Bespoke wedding flowers, luxury arrangements, and curated botanical experiences crafted with rare, seasonal blooms.",
  keywords:
    "luxury florist, wedding flowers Hamilton, bespoke floral design, botanical studio, premium flower arrangements",
  openGraph: {
    title: "Juniper Floral Studio | Luxury Floral Design",
    description:
      "Artisanal floral design studio. Bespoke wedding flowers and luxury arrangements crafted with rare, seasonal blooms.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className="grain">{children}</body>
    </html>
  );
}
