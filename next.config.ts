import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pdfjs-dist", "mammoth", "postgres"],
  outputFileTracingIncludes: { "/*": ["./fixtures/legacy/documents/**/*", "./fixtures/legacy/truth/**/*", "./eval/baselines/**/*", "./rulepacks/**/*.yaml", "./fixtures/deals/*/truth/*.json"] },
  experimental: {
    serverActions: { bodySizeLimit: "110mb" },
  },
};

export default nextConfig;
