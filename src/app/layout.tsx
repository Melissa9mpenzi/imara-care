import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMARA-CARE | Hospital Management",
  description: "A connected workspace for patient care and hospital operations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
