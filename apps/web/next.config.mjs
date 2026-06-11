import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot = path.join(__dirname, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // CRITICAL for Docker / Cloud Run deployment.
  // Generates a self-contained .next/standalone/ folder with only
  // the files Node needs at runtime.
  output: "standalone",

  // Both root settings must be identical, per Next.js validation.
  // Use the monorepo root so workspace resolution works correctly
  // inside the Docker container.
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
