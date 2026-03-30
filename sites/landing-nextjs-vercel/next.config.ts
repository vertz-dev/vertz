import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/docs',
        destination: 'https://docs.vertz.dev',
        permanent: true,
      },
      {
        source: '/docs/:path*',
        destination: 'https://docs.vertz.dev/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
