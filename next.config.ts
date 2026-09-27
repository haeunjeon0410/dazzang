import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 와이파이의 폰 등 다른 기기에서 개발 서버(HMR)에 접속할 수 있도록 허용
  allowedDevOrigins: ["192.168.219.105", "192.168.*.*"],
};

export default nextConfig;
