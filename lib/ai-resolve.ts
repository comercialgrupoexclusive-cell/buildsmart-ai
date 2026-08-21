// ═══════════════════════════════════════════════════════════════════════════
// Resolução segura de entidade por nome, para qualquer ferramenta de IA que
// possa escrever (tarefas-ai-tools, ai-obra-tools, projeto-ai-tools).
//
// Substitui o padrão antigo `ilike(...).limit(1)` (escolhe uma linha
// arbitrária/mais recente quando várias batem) por:
//   1. correspondência exata normalizada — se existir exatamente uma, usa;
//   2. senão, entre as candidatas por semelhança (fuzzy): se sobrar
//      exatamente uma, usa; se sobrar mais de uma, NÃO escolhe — devolve as
//      candidatas para o chamador pedir desambiguação; se nenhuma, "não
//      encontrada".
// Um `order by` torna a escolha determinística, mas não a torna correta —
// esta função nunca decide sozinha entre duas ou mais correspondências reais.
// ═══════════════════════════════════════════════════════════════════════════

export type ResolveOutcome<T> =
  | { tipo: 'unica'; item: T }
  | { tipo: 'ambigua'; candidatos: T[] }
  | { tipo: 'nao_encontrada' }

const DIACRITICOS = new RegExp(String.fromCharCode(91) + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + String.fromCharCode(93), 'g')

export function normalizarNome(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .trim()
}

/**
 * `candidatos` já deve vir filtrado por semelhança (ex.: `ilike '%nome%'` no
 * banco, sem `limit(1)`) — esta função só decide, entre eles, se dá para
 * escolher um com segurança.
 */
export function resolverComSeguranca<T>(nomeBuscado: string, candidatos: T[], obterNome: (item: T) => string): ResolveOutcome<T> {
  if (!candidatos.length) return { tipo: 'nao_encontrada' }
  if (candidatos.length === 1) return { tipo: 'unica', item: candidatos[0] }

  const alvo = normalizarNome(nomeBuscado)
  const exatos = candidatos.filter(c => normalizarNome(obterNome(c)) === alvo)
  if (exatos.length === 1) return { tipo: 'unica', item: exatos[0] }
  if (exatos.length > 1) return { tipo: 'ambigua', candidatos: exatos }

  return { tipo: 'ambigua', candidatos }
}

/** Mensagem padrão de desambiguação, reaproveitável pelos módulos de tools. */
export function formatarAmbiguidade(rotulo: string, nomeBuscado: string, nomes: string[]): string {
  return `Encontrei ${nomes.length} ${rotulo} parecidos com "${nomeBuscado}": ${nomes.map(n => `"${n}"`).join(', ')}. Qual deles você quer dizer?`
}
