/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@eurocomply/database', '@eurocomply/ingestor'],
};

module.exports = nextConfig;
