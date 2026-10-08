import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "YO FUTURO",
  description: "Cada día, tu yo futuro te escribe un mensaje.",
  applicationName: "Yo Futuro",
  // iPhone: added to the home screen it opens full screen (apple-mobile-web-app-capable), with
  // "Yo Futuro" under the icon and a black status bar with white text (the app is dark).
  appleWebApp: { capable: true, title: "Yo Futuro", statusBarStyle: "black" },
  formatDetection: { telephone: false },
  // Next 16 emits "mobile-web-app-capable"; earlier iOS versions read the classic tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Full screen down to the iPhone's home indicator: whatever is pinned to the bottom (the
  // bottom bar, the chat box) keeps clear of it with env(safe-area-inset-bottom).
  viewportFit: "cover",
  // The browser bar in the app's background color (--ink).
  themeColor: "#12141c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-parchment">
        {children}
      </body>
    </html>
  );
}
