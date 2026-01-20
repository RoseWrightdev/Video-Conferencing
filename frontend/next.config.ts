import type { NextConfig } from "next";

// Build-time environment variable validation
function validateBuildEnv() {
  const errors: string[] = [];

  // Skip validation during tests
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  // Validate NEXT_PUBLIC_WS_URL
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (!wsUrl) {
    errors.push('NEXT_PUBLIC_WS_URL is required');
  } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    errors.push('NEXT_PUBLIC_WS_URL must start with ws:// or wss://');
  }

  if (errors.length > 0) {
    console.error('\n❌ Build-time environment validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease set the required environment variables and try again.\n');
    throw new Error('Environment validation failed');
  }

  console.log('✅ Build-time environment validation passed');
  console.log(`  - NEXT_PUBLIC_WS_URL: ${wsUrl}`);
}

// Run validation during build
validateBuildEnv();

const nextConfig: NextConfig = {
  // Enable standalone output for Docker optimization
  output: 'standalone',

  // Optimize for production
  poweredByHeader: false,
  reactStrictMode: true,

  // Image optimization
  images: {
    unoptimized: false,
    domains: [],
  },

  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Experimental features
  experimental: {
    // Enable optimizations
    optimizeCss: true,
  },

  async rewrites() {
    // Check if we are in a docker container (simple check or env var)
    // Default to localhost for local dev, but allow override.
    const backendUrl = 'http://backend:8080';
    console.log('Rewrites configuration:', {
      BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL,
      resolvedBackendUrl: backendUrl,
    });

    return [
      {
        source: '/api/rooms/:path*',
        destination: `${backendUrl}/api/rooms/:path*`,
      },
      {
        source: '/api/messages/:path*',
        destination: `${backendUrl}/api/messages/:path*`,
      },
      {
        source: '/api/logs/:path*',
        destination: `${backendUrl}/api/logs/:path*`,
      },
    ];
  },
};

export default nextConfig;
