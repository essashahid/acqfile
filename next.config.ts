import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  logging: { incomingRequests: { ignore: [/^\/p(?:\/|$)/] } },
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pdfjs-dist", "mammoth", "postgres"],
  outputFileTracingIncludes: {
    "/*": [
      "./fixtures/legacy/documents/**/*",
      "./fixtures/legacy/truth/**/*",
      "./eval/baselines/**/*",
      "./rulepacks/**/*.yaml",
      "./fixtures/deals/*/truth/*.json",
      "./fixtures/demo/generated/prepared-candidates.json",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "110mb" },
  },
};

export default nextConfig;
