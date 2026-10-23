import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ORITHOS_BRAND } from "@/components/OrithosBrandMark";
import { AuthProvider } from "@/lib/auth";

// Authenticated tenant pages must not be emitted as reusable static HTML.
// Client data is scoped by the HttpOnly session cookie and tenant host.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orithos | Smart Point of Sale",
  description: "Orithos — AI-powered retail point of sale for bottle shops and specialty retail",
  icons: {
    icon: [{ url: ORITHOS_BRAND.icon, type: "image/svg+xml" }],
    shortcut: ORITHOS_BRAND.icon,
    apple: ORITHOS_BRAND.appleTouch,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU" className="h-full antialiased">
      <body className="min-h-full bg-[var(--oh-surface)]">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
