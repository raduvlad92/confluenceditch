import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR ?? ".next",
  transpilePackages: ["@confluenceditch/types", "@confluenceditch/archive", "@confluenceditch/confluence"],
}

export default nextConfig
