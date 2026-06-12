import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equation Symphony — Hear & See Mathematics",
  description: "Transform mathematical equations into real-time audio synthesis and animated geometric visualizations entirely client-side using Web Audio and Canvas APIs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
