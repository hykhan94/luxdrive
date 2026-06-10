/** @type {import('next').NextConfig} */
const nextConfig = {
  // CRITICAL for Docker / Cloud Run deployment.
  // Generates a self-contained .next/standalone/ folder with only
  // the files Node needs at runtime. Drops Cloud Run cold-start time.
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
