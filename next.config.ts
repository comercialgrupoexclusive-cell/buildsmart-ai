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
      // PoC OpenPlan3D — a SPA SvelteKit vendorizada vive em
      // public/labs/openplan3d-runtime/ e é compilada com esse mesmo
      // caminho como `base` (ver scripts/build-openplan3d.mjs). A rota
      // /labs/openplan3d é só o wrapper Next.js que embute o iframe — os
      // dois caminhos precisam ficar separados, senão o router do Svelte
      // trata a URL do wrapper como rota interna e cai no +error.svelte.
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
