/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  webpack: (config, { isServer }) => {
    // Fallback for Node.js modules in client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
        url: false,
        buffer: false,
        stream: false,
      };
    }

    // Mark large dependencies as external for serverless functions to reduce bundle size
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push(
        'sharp',
        'puppeteer',
        '@imgly/background-removal-node',
        'archiver',
        'formidable',
        'node-fetch',
        'papaparse',
        'text-to-svg',
      );
    }

    return config;
  },
};

module.exports = nextConfig; 