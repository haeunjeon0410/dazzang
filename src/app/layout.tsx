import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { PushSetup } from "./push-setup";

const ongeulip = localFont({
  src: "./fonts/ongeulip-dahyun.ttf",
  variable: "--font-ongeulip",
  display: "swap",
});

export const metadata: Metadata = {
  title: "다짱",
  description: "친구와 주 3회 운동 인증, 못하면 벌금",
  manifest: "/manifest.json",
  icons: {
    icon: "/assets/app-icon-192.png",
    apple: "/assets/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "다짱",
  },
  other: {
    // 구형 iOS Safari는 이 접두사 붙은 태그만 인식하는 경우가 있어서 같이 넣어둠
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: "#ec4899",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${ongeulip.variable} h-full antialiased`}>
      <body className={`${ongeulip.className} min-h-full flex flex-col bg-[#ffeef5] text-[#4a2540]`}>
        <PushSetup />
        {children}
      </body>
    </html>
  );
}
