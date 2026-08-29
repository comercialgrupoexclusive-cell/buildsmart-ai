import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildSmart V2",
  description: "Fundação técnica do BuildSmart V2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
