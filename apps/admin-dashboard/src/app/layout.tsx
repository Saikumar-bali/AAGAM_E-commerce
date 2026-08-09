import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import TenDigitPhoneGuard from "@/components/TenDigitPhoneGuard";
import CustomerDeliveryOtpListener from "@/components/customer/CustomerDeliveryOtpListener";

export const metadata: Metadata = {
  title: "Aagaam Commerce",
  description: "Professional quick-commerce shopping, store operations, and delivery tracking.",
  icons: {
    icon: "/brand/aagam-mark",
    shortcut: "/brand/aagam-mark",
    apple: "/brand/aagam-mark",
  },
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
          <TenDigitPhoneGuard />
          <CustomerDeliveryOtpListener />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
