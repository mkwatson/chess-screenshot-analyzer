import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DevConsole } from "@/components/dev-console";

export const metadata: Metadata = {
  title: "Chess Screenshot Analyzer",
  description: "Paste a chess position, get coached by an AI agent.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chess Coach",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <DevConsole />
        {children}
      </body>
    </html>
  );
}
