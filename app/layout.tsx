import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ServesIT Support Copilot",
  description: "AI-powered support copilot for ServesIT",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
