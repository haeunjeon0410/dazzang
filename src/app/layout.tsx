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
  // 인풋 포커스할 때 iOS 사파리가 자동으로 화면을 확대하는 걸 막음 (사정 봐달라기 등 입력창)
  maximumScale: 1,
  // 노치/다이나믹 아일랜드/하단 홈 인디케이터가 있는 기종에서 safe-area 값을 실제로 쓸 수 있게 함
  viewportFit: "cover",
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
