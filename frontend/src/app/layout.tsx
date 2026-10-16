import type { Metadata } from "next";
import { Manrope, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const geistSans = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Хлібне ремесло — пекарня у Харкові",
  description: "Знайомтеся з вітриною пекарні «Хлібне ремесло». Хліб, випічка та прості радощі. Харків, вул. Шевченка, 167.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
