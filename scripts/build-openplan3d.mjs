// Motor oficial do módulo Planta 2D/3D do Processo — reconstrói o app
// vendorizado em vendor/openplan3d/ (commit pinado — ver
// vendor/openplan3d/VENDOR.md) e copia o resultado estático para
// public/labs/openplan3d-runtime/, de onde o Next.js serve como asset
// estático. `components/processo/planta-baixa/PlantaEditor.tsx` embute a
// raiz desse runtime num iframe same-origem e fala o protocolo bs:* (ver
// vendor/openplan3d/src/lib/services/bridge.ts) — Supabase (`plantas.
// plan_json`) é a fonte canônica, o runtime não persiste nada por conta
// própria quando embutido. O caminho público (`/labs/openplan3d-runtime`)
// é um nome legado da rodada de PoC anterior; manter evita recompilar o
// `base` do SvelteKit sem ganho funcional.
//
// NÃO faz parte do `npm run build` principal: é um app SvelteKit inteiro
// com seu próprio node_modules (~260 pacotes), que só precisa ser
// rebuildado quando vendor/openplan3d/ mudar. Rodar manualmente e commitar
// o resultado em public/labs/openplan3d-runtime/.
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
