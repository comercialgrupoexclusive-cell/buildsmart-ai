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
    // vendor/openplan3d é um sub-projeto vendorizado com seu próprio
    // eslint.config.js/node_modules, já lintado isoladamente ali dentro;
    // não é código do app Next.js.
    "vendor/**",
    // Bug real encontrado nesta rodada: `npm run lint` sem argumentos
    // (eslint's próprio file discovery) varre `public/` inteiro, incluindo
    // o runtime OpenPlan3D compilado/minificado — nunca foi ignorado
    // (existia o mesmo problema antes desta rodada, só nunca tinha sido
    // rodado sem uma lista de arquivos explícita). Asset gerado por build,
    // não código-fonte do app.
    "public/labs/openplan3d-runtime/**",
  ]),
]);

export default eslintConfig;
