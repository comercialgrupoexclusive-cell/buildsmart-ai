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
      // PoC OpenPlan3D (/labs/openplan3d) — SvelteKit SPA vendorizada em
      // public/labs/openplan3d/ (ver vendor/openplan3d/VENDOR.md). Só entra
      // em jogo quando nenhum arquivo estático real (_app/**, models/**...)
      // nem rota do Next.js casou, então não interfere com o resto do app —
      // serve o mesmo index.html para qualquer sub-rota interna da SPA
      // (ex.: /labs/openplan3d/editor) num reload direto.
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/labs/openplan3d/:path*",
          destination: "/labs/openplan3d/index.html",
        },
      ],
    };
  },
};

export default nextConfig;
