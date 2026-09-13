import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import TenDigitPhoneGuard from "@/components/TenDigitPhoneGuard";
import CustomerDeliveryOtpListener from "@/components/customer/CustomerDeliveryOtpListener";
import RiderPhotoProofFallback from "@/components/rider/RiderPhotoProofFallback";

export const metadata: Metadata = {
  title: "Aagaam Commerce",
  description: "Professional quick-commerce shopping, store operations, and delivery tracking.",
  icons: {
    icon: "/brand/aagam-logo-full.png",
    shortcut: "/brand/aagam-logo-full.png",
    apple: "/brand/aagam-logo-full.png",
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
          <RiderPhotoProofFallback />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
