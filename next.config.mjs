/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Enable experimental features for server actions */
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // Allow larger medical image uploads
    },
  },

  /* Image optimization for medical image processing */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.**.com",
      },
    ],
  },
};

export default nextConfig;
