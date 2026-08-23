import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sehat-Agent AI — Track A",
  description:
    "Multi-agent healthcare platform: Pharma-Check AI, Lingo-Med AI, Care-Sync AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
