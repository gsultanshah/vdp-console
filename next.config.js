/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove standalone output for now
  // output: 'standalone',
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
  // Add webpack configuration for proper module resolution
  webpack: (config, { isServer }) => {
    // Add resolve aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    };
    
    // Ensure proper module resolution
    config.resolve.extensions = ['.ts', '.tsx', '.js', '.jsx', ...config.resolve.extensions];
    
    return config;
  },
};

module.exports = nextConfig; 