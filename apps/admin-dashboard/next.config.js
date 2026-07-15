/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@aagam/ui", "@aagam/utils", "@aagam/types"],
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const API_BACKEND = process.env.API_BACKEND_URL || 'http://3.7.75.176:3005';
    return [
      {
        source: '/api/:path*',
        destination: `${API_BACKEND}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
