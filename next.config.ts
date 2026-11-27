import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 와이파이의 폰 등 다른 기기에서 개발 서버(HMR)에 접속할 수 있도록 허용
  allowedDevOrigins: ["192.168.219.105", "192.168.*.*"],
  // 어떤 프레임워크로 만들었는지 응답에 드러내지 않는다
  poweredByHeader: false,
  // 모든 응답에 붙이는 기본 보안 헤더
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 파일 종류를 브라우저가 멋대로 추측하지 않게 한다
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 다른 사이트가 이 앱을 틀(iframe) 안에 넣어 버튼을 몰래 누르게 하는 것을 막는다
          { key: "X-Frame-Options", value: "DENY" },
          // 방 코드가 든 주소(/join/코드)가 다른 사이트로 넘어가지 않게 한다
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
