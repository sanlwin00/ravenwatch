import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
