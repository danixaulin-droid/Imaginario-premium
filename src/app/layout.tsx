import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "@/components/toaster";
import SiteHeader from "@/components/site-header";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Imaginário";

export const metadata: Metadata = {
  title: appName,
  description: "Geração e edição de imagens com IA (Premium)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-dvh">
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
