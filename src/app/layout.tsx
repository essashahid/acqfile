import { Source_Serif_4, Public_Sans } from "next/font/google";
import { PRODUCT_NAME } from "@/lib/product";
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-headline", display: "swap" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public", display: "swap" });
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: `${PRODUCT_NAME} secure document portal`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
