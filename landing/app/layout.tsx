import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/geist-sans-latin.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Blizkperse | Private Stablecoin Payments",
  description:
    "Zero-knowledge payment layer for private on-chain stablecoin transfers. Pay teams, distribute grants, and send rewards without exposing amounts on-chain.",
  keywords: [
    "zero-knowledge",
    "privacy",
    "stablecoin",
    "payments",
    "ZK proofs",
    "blockchain",
    "USDC",
  ],
  openGraph: {
    title: "Blizkperse | Private Stablecoin Payments",
    description:
      "A zero-knowledge payment layer where your transfers stay private, and always on-chain.",
    url: "https://blizkperse.com",
    siteName: "Blizkperse",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blizkperse | Private Stablecoin Payments",
    description:
      "A zero-knowledge payment layer where your transfers stay private.",
  },
  metadataBase: new URL("https://blizkperse.com"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
