import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

let withPWA: (config: NextConfig) => NextConfig = (config) => config;
try {
  const withPWAInit = require("@ducanh2912/next-pwa");
  withPWA = (withPWAInit.default || withPWAInit)({
    dest: "public",
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: true,
    reloadOnOnline: true,
    disable: process.env.NODE_ENV === "development",
    workboxOptions: {
      disableDevLogs: true,
    },
  });
} catch (e) {
  // PWA wrapper not installed
}

export default withPWA(nextConfig);
