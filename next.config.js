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
    // Ensure Next.js knows this is a client-only app
    experimental: {
      esmExternals: 'loose'
    }
  }
  
  module.exports = nextConfig