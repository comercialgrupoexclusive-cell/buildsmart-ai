import type { NextConfig } from "next";
import path from "path";
import { copyFileSync, mkdirSync } from "fs";

// Copia o worker do pdfjs-dist para /public a cada build
try {
  mkdirSync(path.join(process.cwd(), "public"), { recursive: true });
  copyFileSync(
    path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
    path.join(process.cwd(), "public/pdf.worker.min.mjs")
  );
} catch {
  // Ignora se não encontrar (CI sem node_modules)
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.2"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Evita que o webpack tente resolver módulos nativos do pdfjs no cliente
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

export default nextConfig;
