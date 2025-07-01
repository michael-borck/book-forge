/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for production builds
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  distDir: process.env.NODE_ENV === 'production' ? 'out' : '.next',
  images: {
    unoptimized: true,
  },
  // Ensure compatibility with Electron
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : '',
  // Disable server-side features
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig