import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IMARA-CARE | Hospital Management",
  description: "A connected workspace for patient care and hospital operations.",
  icons: { icon: "/images/Imara-Care%20Favicon.png", apple: "/images/Imara-Care%20Favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={barlow.variable}>
      <body>{children}</body>
    </html>
  );
}
