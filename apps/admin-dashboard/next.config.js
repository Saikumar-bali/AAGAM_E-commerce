/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@aagam/ui", "@aagam/utils", "@aagam/types"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
