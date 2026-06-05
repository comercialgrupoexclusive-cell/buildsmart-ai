import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildSmart AI — Gestão de Obras",
  description: "Sistema de gestão de obras residenciais para pequenas construtoras brasileiras",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
