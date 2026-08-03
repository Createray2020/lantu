import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import VersionWatcher from "./VersionWatcher";
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
        <body className="min-h-full flex flex-col">
          <VersionWatcher />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
