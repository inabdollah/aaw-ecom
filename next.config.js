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

    return config;
  },
};

module.exports = nextConfig; 