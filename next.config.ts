import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  transpilePackages: ['three'],
};

export default nextConfig;
