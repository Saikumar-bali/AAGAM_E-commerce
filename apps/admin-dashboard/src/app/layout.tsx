import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aagam Commerce OS",
  description: "Enterprise quick-commerce storefront, operations, and rider tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
