import type { NextConfig } from "next";

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
  async rewrites() {
    return {
      // Motor oficial do módulo Planta 2D/3D (OpenPlan3D) — a SPA SvelteKit
      // vendorizada vive em public/labs/openplan3d-runtime/ e é compilada
      // com esse mesmo caminho como `base` (ver
      // scripts/build-openplan3d.mjs). components/processo/planta-baixa/
      // PlantaEditor.tsx embute a raiz desse runtime num iframe.
      //
      // Estes rewrites são `fallback`: só entram em jogo quando nenhum
      // arquivo estático real (_app/**, models/**, textures/**) nem rota do
      // Next.js casou antes, então assets continuam servidos direto e o
      // resto do app não é afetado. Servem o index.html da SPA para a raiz
      // do runtime e para qualquer sub-rota interna dela (ex.:
      // /labs/openplan3d-runtime/editor) num reload direto.
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/labs/openplan3d-runtime",
          destination: "/labs/openplan3d-runtime/index.html",
        },
        {
          source: "/labs/openplan3d-runtime/:path*",
          destination: "/labs/openplan3d-runtime/index.html",
        },
      ],
    };
  },
};

export default nextConfig;
