// PoC OpenPlan3D — reconstrói o app vendorizado em vendor/openplan3d/
// (commit pinado — ver vendor/openplan3d/VENDOR.md) e copia o resultado
// estático para public/labs/openplan3d-runtime/, de onde o Next.js serve
// como asset estático, no mesmo padrão de scripts/build-axonometra.mjs.
//
// A URL pública do runtime (/labs/openplan3d-runtime) é DIFERENTE da rota
// wrapper do BuildSmart (/labs/openplan3d, uma page do Next.js que só
// embute o iframe). As duas não podem colidir: o SvelteKit é compilado com
// `base` igual à raiz do runtime e interpreta qualquer coisa além dessa
// base como rota interna da SPA — com as duas no mesmo caminho, o router
// do Svelte caía no +error.svelte ("Page not found").
//
// NÃO faz parte do `npm run build` principal — mesmo motivo do Axonometra:
// é um app SvelteKit inteiro com seu próprio node_modules (~260 pacotes),
// que só precisa ser rebuildado quando vendor/openplan3d/ mudar. Rodar
// manualmente e commitar o resultado em public/labs/openplan3d-runtime/.
import { execFileSync } from 'child_process'
import { cpSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const vendorDir = join(root, 'vendor', 'openplan3d')
const buildDir = join(vendorDir, 'build')
const basePath = '/labs/openplan3d-runtime'
const publicDir = join(root, 'public', 'labs', 'openplan3d-runtime')

if (!existsSync(vendorDir)) {
  console.error('✗ vendor/openplan3d não existe — nada para buildar.')
  process.exit(1)
}

console.log('→ npm install (vendor/openplan3d)')
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: vendorDir, stdio: 'inherit' })

console.log('→ npm run build (vendor/openplan3d: adapter-static, sem analytics do upstream)')
execFileSync('npm', ['run', 'build'], {
  cwd: vendorDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PUBLIC_ENABLE_ANALYTICS: 'false',
    OPENPLAN3D_BASE_PATH: basePath
  }
})

if (!existsSync(buildDir)) {
  console.error('✗ vendor/openplan3d/build não foi gerado.')
  process.exit(1)
}

rmSync(publicDir, { recursive: true, force: true })
cpSync(buildDir, publicDir, { recursive: true })
console.log(`✓ vendor/openplan3d/build copiado para ${publicDir} (base ${basePath})`)
