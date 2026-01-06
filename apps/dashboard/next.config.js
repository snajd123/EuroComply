/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@eurocomply/shared'],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
