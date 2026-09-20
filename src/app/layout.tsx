import { Source_Serif_4, Public_Sans } from "next/font/google";
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-headline", display: "swap" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public", display: "swap" });
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secure document portal",
  description: "Your documents and next steps",
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
