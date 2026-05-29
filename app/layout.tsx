import type { Metadata } from "next";
// CHANGED: Swapped Geist fonts for Fraunces (display) + DM Sans (body) per new design system.
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Watch Party — P2P Screen Sharing",
  description:
    "Share your screen directly with a friend via peer-to-peer connection. No uploads, no servers touching your video.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // CHANGED: Dropped `dark` class; new palette is single-theme light.
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} h-full antialiased`}
    >
      {/* CHANGED: Body now sits on the warm canvas with ink body text. */}
      <body className="min-h-full flex flex-col bg-canvas text-body">
        {children}
      </body>
    </html>
  );
}
