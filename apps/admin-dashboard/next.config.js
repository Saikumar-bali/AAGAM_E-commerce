/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@aagam/ui", "@aagam/utils", "@aagam/types"],
  typescript: {
    // Production builds must fail on dashboard type errors rather than shipping
    // a bundle whose compiler errors were silently ignored.
    ignoreBuildErrors: false,
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
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Never fall back to a fixed public HTTP server. Local development can use
    // the local API; production deployments should set API_BACKEND_URL to their
    // HTTPS/private service endpoint.
    const API_BACKEND = process.env.API_BACKEND_URL || 'http://127.0.0.1:3005';
    return [
      {
        source: '/api/:path*',
        destination: `${API_BACKEND}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
