/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Ensure dynamic routes are handled properly
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
  // Add trailing slashes to prevent 404s
  trailingSlash: true,
  // Ensure proper handling of static files
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig; 