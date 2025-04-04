// File: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // This ensures the app is served correctly on Vercel
  trailingSlash: false,
  // Remove or modify the experimental settings
  experimental: {
    // Use a safer setting or remove this if it's causing issues
    esmExternals: false
  }
}

module.exports = nextConfig