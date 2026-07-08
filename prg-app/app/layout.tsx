import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Platinum Realty Group Corporate Dashboard",
  description: "Platinum Realty Group internal corporate dashboard and meeting management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
