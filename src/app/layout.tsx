import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader } from "next/font/google";
import { headers } from "next/headers";
import { routing } from "@/i18n/routing";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Taradiddle.news",
  description: "tar·a·did·dle /ˈtærəˌdɪdl/ n. — a petty lie; pretentious nonsense.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Public routes carry the locale via next-intl's middleware header; admin
  // and API routes don't, and fall back to the default locale.
  const lang = (await headers()).get("x-next-intl-locale") ?? routing.defaultLocale;
  return (
    <html lang={lang} className={`${newsreader.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
