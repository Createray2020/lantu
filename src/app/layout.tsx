import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import VersionWatcher from "./VersionWatcher";
import { UI_SCALE_BOOT_SCRIPT } from "@/lib/uiScale";
import "./globals.css";

const sans = Noto_Sans_TC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const serif = Noto_Serif_TC({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "嵐途 LAN TU · 全方位財務規劃",
  description: "理解自己・做出選擇・走向未來",
  // favicon / 分頁 icon 指向動態品牌 icon（可被後台上傳的 logo 取代）。
  icons: {
    icon: [{ url: "/api/brand/icon", type: "image/png" }],
    shortcut: [{ url: "/api/brand/icon", type: "image/png" }],
    apple: [{ url: "/api/brand/icon" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0d2b45",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="zh-Hant"
        className={`${sans.variable} ${serif.variable} h-full antialiased`}
      >
        <head>
          {/* 介面縮放：首次繪製前就把上次選的字級套上，否則放大字的人每次導頁都會看到一下閃動。 */}
          <script dangerouslySetInnerHTML={{ __html: UI_SCALE_BOOT_SCRIPT }} />
        </head>
        <body className="min-h-full flex flex-col">
          <VersionWatcher />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
