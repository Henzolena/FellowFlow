import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n/context";
import { getLocale } from "@/lib/i18n/server";
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
  metadataBase: new URL("https://fellowflow.org"),
  title: {
    default: "FellowFlow — Conference Registration",
    template: "%s | FellowFlow",
  },
  description:
    "Register and pay for conference attendance with FellowFlow. Simple group registration, secure payments, and instant confirmation.",
  applicationName: "FellowFlow",
  authors: [{ name: "FellowFlow" }],
  keywords: [
    "conference",
    "registration",
    "event",
    "payment",
    "fellowflow",
    "church conference",
    "group registration",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "any" },
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: "FellowFlow",
    title: "FellowFlow — Conference Registration",
    description:
      "Register and pay for conference attendance with FellowFlow. Simple group registration, secure payments, and instant confirmation.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "FellowFlow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FellowFlow — Conference Registration",
    description:
      "Register and pay for conference attendance with FellowFlow.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FellowFlow",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LanguageProvider initialLocale={locale}>
          {children}
        </LanguageProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
