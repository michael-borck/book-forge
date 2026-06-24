/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for production builds
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  distDir: process.env.NODE_ENV === 'production' ? 'out' : '.next',
  images: {
    unoptimized: true,
  },
  // Assets are referenced with absolute paths; in production the packaged
  // Electron app should serve the `out/` export via a custom protocol
  // (e.g. app://) rather than file:// so these resolve. A relative assetPrefix
  // (".") is rejected by next/font, so we leave it at the default.
  // Disable server-side features
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig