import type { Metadata } from "next";
import "./globals.css";
import { ProfileProvider } from "@/lib/profile-context";
import { readAccess } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: "BuildSmart AI — Gestão de Obras",
  description: "Sistema de gestão de obras residenciais para pequenas construtoras brasileiras",
  icons: {
    icon: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await readAccess();
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Excalidraw assets path — fonts loaded from /fonts/ */}
        <script dangerouslySetInnerHTML={{ __html: 'window.EXCALIDRAW_ASSET_PATH = "/";' }} />
      </head>
      <body className="min-h-screen antialiased">
        <ProfileProvider initialProfile={access?.profile || null}>{children}</ProfileProvider>
      </body>
    </html>
  );
}
