import { defineConfig } from 'vitest/config'
import path from 'node:path'

// `@` espelha o mesmo `@/*` -> `./*` do tsconfig.json (testes de rotas de
// app/api/**). `server-only` é um guard de build do Next (fica vazio em
// runtime) que não existe fora do bundler do Next — sem o stub, qualquer
// teste que importe lib/luizia-core.ts (via lib/luizia-tools.ts) falha com
// "Cannot find package 'server-only'".
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      'server-only': path.resolve(import.meta.dirname, 'lib/__tests__/stubs/server-only.ts'),
    },
  },
})
