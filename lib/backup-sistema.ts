import { APP_VERSION } from '@/lib/version'
import { createClient } from '@/lib/supabase/client'

type ClienteDados = ReturnType<typeof createClient>

// ─── Backup/restauração completa do sistema ──────────────────────────────────
// Exporta e reimporta TODAS as tabelas do app em um único arquivo .json.
// A ordem abaixo respeita as dependências de chave estrangeira: tabelas "pai"
// vêm antes das "filhas" — usada para INSERIR na restauração; a ordem inversa
// é usada para LIMPAR as tabelas antes de restaurar (evita violação de FK).
export const TABELAS_BACKUP = [
  'profiles',
  'sinapi_insumos',
  'sinapi_composicoes',
  'sinapi_composicao_itens',
  'insumos_proprios',
  'composicoes_proprias',
  'composicao_insumos',
  'obras',
  'fornecedores',
  'obra_fornecedores',
  'etapas',
  'materiais',
  'medicoes',
  'orcamentos',
  'orcamento_itens',
] as const

export type TabelaBackup = typeof TABELAS_BACKUP[number]

export type ArquivoBackup = {
  app: 'buildsmart-ai'
  formato: 1
  versao_app: string
  gerado_em: string
  tabelas: Partial<Record<TabelaBackup, Record<string, unknown>[]>>
}

export type ResumoTabela = { tabela: TabelaBackup; quantidade: number }

// ─── Geração do backup (.json) ───────────────────────────────────────────────
export async function gerarBackupCompleto(supabase: ClienteDados): Promise<{ arquivo: ArquivoBackup; resumo: ResumoTabela[] }> {
  const tabelas: ArquivoBackup['tabelas'] = {}
  const resumo: ResumoTabela[] = []

  for (const tabela of TABELAS_BACKUP) {
    const { data } = await supabase.from(tabela).select('*')
    const linhas = data || []
    tabelas[tabela] = linhas
    resumo.push({ tabela, quantidade: linhas.length })
  }

  const arquivo: ArquivoBackup = {
    app: 'buildsmart-ai',
    formato: 1,
    versao_app: APP_VERSION,
    gerado_em: new Date().toISOString(),
    tabelas,
  }

  return { arquivo, resumo }
}

export function baixarBackupJSON(arquivo: ArquivoBackup) {
  const conteudo = JSON.stringify(arquivo, null, 2)
  const blob = new Blob([conteudo], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const data = arquivo.gerado_em.split('T')[0]
  const a = document.createElement('a')
  a.href = url
  a.download = `backup_buildsmart_${data}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ─── Leitura e validação do arquivo de backup ────────────────────────────────
export type LeituraBackup =
  | { valido: true; arquivo: ArquivoBackup; resumo: ResumoTabela[] }
  | { valido: false; erro: string }

export async function lerArquivoBackup(file: File): Promise<LeituraBackup> {
  let bruto: unknown
  try {
    const texto = await file.text()
    bruto = JSON.parse(texto)
  } catch {
    return { valido: false, erro: 'O arquivo não é um JSON válido. Selecione um backup gerado pelo BuildSmart AI (.json).' }
  }

  if (!bruto || typeof bruto !== 'object' || (bruto as Record<string, unknown>).app !== 'buildsmart-ai' || !(bruto as Record<string, unknown>).tabelas) {
    return { valido: false, erro: 'Este arquivo não parece ser um backup do BuildSmart AI — verifique se selecionou o arquivo correto.' }
  }

  const arquivo = bruto as ArquivoBackup
  const resumo: ResumoTabela[] = TABELAS_BACKUP.map(tabela => ({
    tabela,
    quantidade: Array.isArray(arquivo.tabelas[tabela]) ? (arquivo.tabelas[tabela] as unknown[]).length : 0,
  }))

  return { valido: true, arquivo, resumo }
}

// ─── Restauração — limpa e recarrega todas as tabelas ────────────────────────
export type ProgressoRestauracao = { etapa: 'limpando' | 'restaurando'; tabela: TabelaBackup; indice: number; total: number }
export type ResultadoRestauracao = { tabelasRestauradas: number; linhasRestauradas: number; erros: string[] }

const LOTE = 200

export async function restaurarBackup(
  supabase: ClienteDados,
  arquivo: ArquivoBackup,
  onProgresso?: (p: ProgressoRestauracao) => void
): Promise<ResultadoRestauracao> {
  const erros: string[] = []
  let tabelasRestauradas = 0
  let linhasRestauradas = 0

  const ordemLimpeza = [...TABELAS_BACKUP].reverse()
  const total = TABELAS_BACKUP.length

  // 1) Limpa todas as tabelas (filhas → pais) para evitar conflitos de FK/duplicidade
  for (let i = 0; i < ordemLimpeza.length; i++) {
    const tabela = ordemLimpeza[i]
    onProgresso?.({ etapa: 'limpando', tabela, indice: i + 1, total })
    const { error } = await supabase.from(tabela).delete().neq('id', '__buildsmart_backup_never_matches__')
    if (error) erros.push(`Limpar "${tabela}": ${error.message}`)
  }

  // 2) Restaura na ordem pai → filho, em lotes
  for (let i = 0; i < TABELAS_BACKUP.length; i++) {
    const tabela = TABELAS_BACKUP[i]
    onProgresso?.({ etapa: 'restaurando', tabela, indice: i + 1, total })
    const linhas = arquivo.tabelas[tabela]
    if (!linhas || linhas.length === 0) continue

    let falhou = false
    for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
      const lote = linhas.slice(inicio, inicio + LOTE)
      const { error } = await supabase.from(tabela).insert(lote)
      if (error) {
        erros.push(`Restaurar "${tabela}" (linhas ${inicio + 1}-${inicio + lote.length}): ${error.message}`)
        falhou = true
        break
      }
      linhasRestauradas += lote.length
    }
    if (!falhou) tabelasRestauradas++
  }

  return { tabelasRestauradas, linhasRestauradas, erros }
}

export const ROTULOS_TABELA: Record<TabelaBackup, string> = {
  profiles: 'Perfis de usuário',
  sinapi_insumos: 'Insumos SINAPI',
  sinapi_composicoes: 'Composições SINAPI',
  sinapi_composicao_itens: 'Itens de composição SINAPI',
  insumos_proprios: 'Insumos próprios',
  composicoes_proprias: 'Composições próprias',
  composicao_insumos: 'Itens de composição própria',
  obras: 'Obras',
  fornecedores: 'Fornecedores',
  obra_fornecedores: 'Vínculos obra ↔ fornecedor',
  etapas: 'Etapas/cronograma',
  materiais: 'Materiais/compras',
  medicoes: 'Medições',
  orcamentos: 'Orçamentos',
  orcamento_itens: 'Itens de orçamento',
}
