import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import TenDigitPhoneGuard from "@/components/TenDigitPhoneGuard";
import AagaamBrandMigration from "@/components/AagaamBrandMigration";

export const metadata: Metadata = {
  title: "Aagaam Commerce",
  description: "Professional quick-commerce shopping, store operations, and delivery tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ToastProvider>
          <AagaamBrandMigration />
          <TenDigitPhoneGuard />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
