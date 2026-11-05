import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});
const sans = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Favor Upon You Rentals — Luxury Outdoor Umbrella Rentals", template: "%s · Favor Upon You Rentals" },
  description:
    "Luxury outdoor umbrella rentals in Houston & surrounding areas. Delivery, setup and pick-up included.",
};

export const viewport: Viewport = { themeColor: "#f8f6f1" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh flex flex-col">{children}</body>
    </html>
  );
}
