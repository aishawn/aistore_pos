import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ORITHOS_BRAND } from "@/components/OrithosBrandMark";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/components/ThemeProvider";

const themeInitScript = `(() => {
  try {
    const stored = localStorage.getItem("orithos-theme");
    const theme = stored === "dark" ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  } catch {}
})()`;

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
    <html lang="en-AU" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-[var(--oh-surface)]">
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
