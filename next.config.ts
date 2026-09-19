import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pdfjs-dist", "mammoth", "postgres"],
  outputFileTracingIncludes: { "/*": ["./fixtures/legacy/documents/**/*", "./fixtures/legacy/truth/**/*", "./eval/baselines/**/*", "./rulepacks/**/*.yaml"] },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
