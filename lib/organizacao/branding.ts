import type { SupabaseClient } from '@supabase/supabase-js'

// Dados do branding da organização (nome do assistente + logo). A escrita passa
// pela função organizacao_branding_atualizar, que só aceita owner/admin da org.

const BUCKET = 'project-files'
const TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024
export const ASSISTENTE_NOME_MAX = 40
export const ASSISTENTE_NOME_PADRAO = 'Assistente'

// Textos neutros de gênero: o nome é livre, então nada de "a/da/à" fixos. Cada
// helper devolve a forma certa para o padrão ("assistente") e para um nome próprio.

// "o assistente" / "Teo"      → "Eu sou {…}.", "peça para {…} pesquisar"
export function oAssistente(nome: string): string {
  return nome === ASSISTENTE_NOME_PADRAO ? 'o assistente' : nome
}

// "do assistente" / "de Teo"  → "o resumo {…}"
export function doAssistente(nome: string): string {
  return nome === ASSISTENTE_NOME_PADRAO ? 'do assistente' : `de ${nome}`
}

// "ao assistente" / "a Teo"   → "Pergunte {…}…"
export function aoAssistente(nome: string): string {
  return nome === ASSISTENTE_NOME_PADRAO ? 'ao assistente' : `a ${nome}`
}

// Para começo de frase: "O assistente extrai…" / "Teo extrai…"
export function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export type BrandingInput = {
  assistenteNome: string
  logoUrl: string | null
}

const MENSAGENS: Record<string, string> = {
  apenas_admin_da_organizacao: 'Só o dono ou admin da organização pode alterar isso.',
  assistente_nome_muito_longo: `O nome pode ter no máximo ${ASSISTENTE_NOME_MAX} caracteres.`,
  logo_url_invalida: 'O endereço da imagem não é válido.',
  organizacao_nao_selecionada: 'Nenhuma organização selecionada.',
}

function traduzirErro(mensagem: string): string {
  const chave = Object.keys(MENSAGENS).find(k => mensagem.includes(k))
  return chave ? MENSAGENS[chave] : 'Não foi possível salvar. Tente de novo.'
}

export async function salvarBranding(
  supabase: SupabaseClient,
  input: BrandingInput,
): Promise<void> {
  const { error } = await supabase.rpc('organizacao_branding_atualizar', {
    p_assistente_nome: input.assistenteNome,
    p_logo_url: input.logoUrl,
  })
  if (error) throw new Error(traduzirErro(error.message))
}

export async function enviarLogo(
  supabase: SupabaseClient,
  organizacaoId: string,
  arquivo: File,
): Promise<string> {
  if (!arquivo.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem.')
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error('A imagem pode ter no máximo 2 MB.')
  }
  const extensao = arquivo.name.split('.').pop() || 'png'
  const caminho = `org-logo/${organizacaoId}/${Date.now()}.${extensao}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) throw new Error('Não foi possível enviar a imagem.')
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
}
