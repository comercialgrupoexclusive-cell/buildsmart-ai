import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Só o alias precisa ser espelhado aqui (mesmo `@/*` -> `./*` do tsconfig.json)
// para os testes conseguirem importar rotas de app/api/**.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
})
