// BuildSmart P4.6 Bloco B — reconstrói o editor de Planta Baixa (Axonometra
// vendorizado em vendor/axonometra, commit pinado — ver vendor/axonometra/
// VENDOR.md) e copia o resultado para public/axonometra/, de onde o Next.js
// serve como asset estático (iframe em /axonometra/index.html).
//
// NÃO faz parte do `npm run build` principal: o vendored app muda raramente
// (só quando o próprio Bloco B/editor de planta muda), então rodar seu build
// Vite completo (instala node_modules próprio, ~500 pacotes) em todo deploy
// do app principal desperdiçaria tempo de build sem necessidade. Rodar este
// script manualmente sempre que vendor/axonometra mudar, e commitar o
// resultado em public/axonometra/ como qualquer outro asset estático.
import { execFileSync } from 'child_process'
import { cpSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const vendorDir = join(root, 'vendor', 'axonometra')
const distDir = join(vendorDir, 'dist')
const publicDir = join(root, 'public', 'axonometra')

if (!existsSync(vendorDir)) {
  console.error('✗ vendor/axonometra não existe — nada para buildar.')
  process.exit(1)
}

console.log('→ npm install (vendor/axonometra)')
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: vendorDir, stdio: 'inherit' })

console.log('→ npm run build (vendor/axonometra: tsc --noEmit && vite build)')
execFileSync('npm', ['run', 'build'], { cwd: vendorDir, stdio: 'inherit' })

if (!existsSync(distDir)) {
  console.error('✗ vendor/axonometra/dist não foi gerado.')
  process.exit(1)
}

rmSync(publicDir, { recursive: true, force: true })
cpSync(distDir, publicDir, { recursive: true })
console.log(`✓ vendor/axonometra/dist copiado para ${publicDir}`)
