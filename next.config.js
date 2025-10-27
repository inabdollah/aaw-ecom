/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'prod.aaw.com',
      },
      {
        protocol: 'https',
        hostname: 'tap-assets.b-cdn.net',
      },
      {
        protocol: 'https',
        hostname: 'static.aawweb.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
    ],
  },

  experimental: {
    isrMemoryCacheSize: 0,
  },
  
  webpack: (config, { isServer }) => {
    // Properly resolve @ path alias
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname),
    };

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
      const largeModules = [
        'sharp',
        'puppeteer',
        '@imgly/background-removal',
        '@imgly/background-removal-node',
        'archiver',
        'formidable',
        'node-fetch',
        'papaparse',
        'text-to-svg',
        'multer',
        'axios',
      ];

      config.externals = config.externals || [];
      
      // Add all large modules as externals
      largeModules.forEach(module => {
        if (!config.externals.includes(module)) {
          config.externals.push(module);
        }
      });
    }

    return config;
  },
};

module.exports = nextConfig; 