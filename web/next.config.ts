import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The circle rules live in ../core as TypeScript source.
  transpilePackages: ['@ajo/core'],
};

export default nextConfig;
