/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Enable experimental features for server actions */
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // Allow larger medical image uploads
    },
    /* Prevent webpack from bundling native Node.js packages on the server */
    serverComponentsExternalPackages: ["tesseract.js", "sharp"],
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
