import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Cormorant_Garamond,
  DM_Sans,
  Figtree,
  Fraunces,
  Geist,
  Geist_Mono,
  Great_Vibes,
  Instrument_Serif,
  Inter,
  Libre_Baskerville,
  Lora,
  Manrope,
  Montserrat,
  Outfit,
  Playfair_Display,
  Poppins,
  Space_Grotesk,
  Work_Sans,
} from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// ── Base system fonts ───────────────────────────────────────────────────
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

// ── Curated per-business fonts ─────────────────────────────────────────
// Each of these exposes its own CSS variable. Per-business layouts pick
// which var drives `--font-sans` / `--font-heading`. All load once, pre-
// connected to Google Fonts by Next.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const libreBaskerville = Libre_Baskerville({
  variable: "--font-libre-baskerville",
  subsets: ["latin"],
  weight: ["400", "700"],
});
// ── Carta theme (spec 44) — sustitutos de Angelic (script) y Gotham (sans) ──
const greatVibes = Great_Vibes({
  variable: "--font-great-vibes",
  subsets: ["latin"],
  weight: "400",
});
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Pedidos",
  description: "Pedidos online para tu negocio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = [
    geistSans.variable,
    geistMono.variable,
    instrumentSerif.variable,
    inter.variable,
    poppins.variable,
    dmSans.variable,
    workSans.variable,
    manrope.variable,
    spaceGrotesk.variable,
    outfit.variable,
    figtree.variable,
    bricolage.variable,
    playfair.variable,
    lora.variable,
    fraunces.variable,
    cormorant.variable,
    libreBaskerville.variable,
    greatVibes.variable,
    montserrat.variable,
  ].join(" ");

  return (
    <html lang="es">
      <body className={`${fontVars} antialiased`}>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
