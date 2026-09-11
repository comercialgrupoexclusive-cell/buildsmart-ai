import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // P4.6 Bloco B — vendor/axonometra é um sub-projeto vendorizado com seu
    // próprio eslint.config.js/node_modules, já lintado isoladamente ali
    // dentro; não é código do app Next.js. public/axonometra é o build
    // minificado desse mesmo sub-projeto (gerado por
    // scripts/build-axonometra.mjs) — asset estático, não código-fonte.
    "vendor/**",
    "public/axonometra/**",
  ]),
]);

export default eslintConfig;
