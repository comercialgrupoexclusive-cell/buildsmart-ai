import { cpSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src  = join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts')
const dest = join(root, 'public', 'fonts')

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true, force: true })
  console.log('✓ Excalidraw fonts copied to public/fonts')
} else {
  console.warn('⚠ Excalidraw fonts not found at:', src)
}
