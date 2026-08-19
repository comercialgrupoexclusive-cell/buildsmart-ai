import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const obraId = process.argv[2]
const profileId = process.argv[3]

if (!obraId || !profileId) {
  throw new Error('Uso: node scripts/seed-portal-feed-demo.mjs <obra_id> <profile_id>')
}

const env = await loadEnv('.env.local')
// feed_admin_list/feed_admin_publish agora só aceitam execute de service_role
// (ver migration lock_down_portal_admin_rpcs) — script de seed precisa da
// service role key, não mais da anon key.
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente em .env.local — necessária para publicar no feed via seed script.')
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const demoKey = 'portal-feed-demo-v1'
const images = [
  { file: 'public/demo/feed/allegra-estrutura-demo.png', name: 'DEMO - Estrutura da residencia.png' },
  { file: 'public/demo/feed/allegra-laje-demo.png', name: 'DEMO - Preparacao da laje.png' },
  { file: 'public/demo/feed/allegra-eletrica-demo.png', name: 'DEMO - Instalacoes eletricas.png' },
]

const storedFiles = []
for (let index = 0; index < images.length; index += 1) {
  const definition = images[index]
  const existing = await supabase.from('obra_files').select('id,nome,url,tipo,source_type,source_id,source_index')
    .eq('obra_id', obraId).eq('source_type', 'demo').eq('source_id', demoKey).eq('source_index', index).maybeSingle()
  if (existing.data) { storedFiles.push(existing.data); continue }

  const bytes = await readFile(resolve(definition.file))
  const storagePath = `obras/${obraId}/feed/demo/${demoKey}-${index}-${basename(definition.file)}`
  const uploaded = await supabase.storage.from('project-files').upload(storagePath, bytes, { contentType: 'image/png', cacheControl: '86400', upsert: true })
  if (uploaded.error) throw uploaded.error
  const url = supabase.storage.from('project-files').getPublicUrl(storagePath).data.publicUrl
  const inserted = await supabase.from('obra_files').insert({
    obra_id: obraId, nome: definition.name, tipo: 'image/png', tamanho: bytes.length,
    categoria: 'imagem', url, uploaded_by: profileId, publicado_cliente: true,
    source_type: 'demo', source_id: demoKey, source_index: index,
  }).select('id,nome,url,tipo,source_type,source_id,source_index').single()
  if (inserted.error) throw inserted.error
  storedFiles.push(inserted.data)
}

const current = await supabase.rpc('feed_admin_list', { p_obra_id: obraId, p_profile_id: profileId })
if (current.error) throw current.error
const existingSources = new Set((current.data || []).map(item => item.sourceId))
const publications = [
  {
    sourceId: `${demoKey}-story-estrutura`, title: 'DEMO - Estrutura do pavimento em andamento',
    content: 'Conteudo demonstrativo para testar a experiencia do cliente. Formas, pilares e alvenaria avancam nesta frente.',
    story: true, files: [storedFiles[0].id],
  },
  {
    sourceId: `${demoKey}-story-laje`, title: 'DEMO - Preparacao da laje',
    content: 'Conteudo demonstrativo. Armaduras e esperas conferidas antes da concretagem.',
    story: true, files: [storedFiles[1].id],
  },
  {
    sourceId: `${demoKey}-feed-semana`, title: 'DEMO - Atualizacao semanal da obra',
    content: 'Publicacao de teste: nesta semana as frentes de estrutura e instalacoes seguiram conforme o planejamento. As imagens abaixo sao ficticias e servem apenas para validar o Portal.',
    story: true, files: storedFiles.map(file => file.id),
  },
  {
    sourceId: `${demoKey}-feed-eletrica`, title: 'DEMO - Instalacoes eletricas em execucao',
    content: 'Publicacao de teste para conferir fotos, curtidas e comentarios no celular.',
    story: false, files: [storedFiles[2].id],
  },
]

for (const publication of publications) {
  if (existingSources.has(publication.sourceId)) continue
  const result = await supabase.rpc('feed_admin_publish', {
    p_obra_id: obraId, p_profile_id: profileId, p_orcamento_id: null,
    p_titulo: publication.title, p_conteudo: publication.content, p_visibility: 'client',
    p_is_story: publication.story, p_album_nome: 'Demonstracao do Portal',
    p_file_ids: publication.files, p_source_type: 'manual', p_source_id: publication.sourceId,
  })
  if (result.error) throw result.error
}

console.log(`Demo criada: ${storedFiles.length} fotos e ${publications.length} publicacoes verificadas.`)

async function loadEnv(file) {
  const text = await readFile(file, 'utf8')
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')] }))
}
