import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ProductionWarningBanner } from "@/components/shared/production-warning-banner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elevated Claims Builder",
  description: "Internal claims supplement and export workflow platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <ProductionWarningBanner />
        {children}
      </body>
    </html>
  );
}