// Service do domínio Investidor (Tellus R01 / Seção D).
//
// Regra de negócio pura, sem IO: validação, normalização e derivação de
// estado. É aqui que mora a lógica que a UI e a futura IA precisam executar
// de forma idêntica e determinística — o Repository só grava, as Actions só
// orquestram. Nenhuma função deste arquivo toca o Supabase.
import type {
  ProspeccaoFicha,
  ProspeccaoFichaConflito,
} from '@/lib/types'

function fmtValor(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

export type ValidacaoFichaEntrada = {
  dadosExtraidos: Record<string, unknown>
  // Mapa campo → valor confirmado/corrigido pelo humano (string vazia = campo
  // deixado pendente de propósito).
  confirmados: Record<string, string>
  // O humano clicou "Marcar ficha como validada" (força status validada) vs.
  // "Salvar validação" (status derivado das pendências).
  marcarValidada: boolean
}

export type ValidacaoFichaResultado = {
  dados_confirmados: Record<string, unknown>
  conflitos: ProspeccaoFichaConflito[]
  status: ProspeccaoFicha['status']
}

// Deriva o patch de validação da ficha a partir do que a fonte disse
// (dados_extraidos) e do que o humano confirmou/corrigiu (confirmados).
// "Fonte é evidência, não verdade": uma divergência não é apagada, vira
// conflito registrado. Mesma lógica que estava embutida em
// ProspeccaoFicha.salvarValidacao — extraída para ser testável e reutilizável.
export function derivarValidacaoFicha(entrada: ValidacaoFichaEntrada): ValidacaoFichaResultado {
  const { dadosExtraidos, confirmados, marcarValidada } = entrada
  const dados_confirmados: Record<string, unknown> = {}
  const conflitos: ProspeccaoFichaConflito[] = []

  for (const campo of Object.keys(confirmados)) {
    const valorConfirmado = confirmados[campo]
    if (valorConfirmado.trim() === '') continue
    dados_confirmados[campo] = valorConfirmado
    const valorExtraido = dadosExtraidos[campo]
    if (
      valorExtraido != null &&
      fmtValor(valorExtraido).trim().toLowerCase() !== valorConfirmado.trim().toLowerCase()
    ) {
      conflitos.push({ campo, valor_extraido: valorExtraido, valor_confirmado: valorConfirmado })
    }
  }

  const camposPendentes = Object.keys(dadosExtraidos).filter(
    c => !confirmados[c] || confirmados[c].trim() === '',
  )
  const status: ProspeccaoFicha['status'] = marcarValidada
    ? 'validada'
    : camposPendentes.length === 0
      ? 'validada'
      : 'parcial'

  return { dados_confirmados, conflitos, status }
}

// Normaliza a chave de um campo digitado manualmente: minúsculas e underscore
// no lugar de espaço (mesma regra de ProspeccaoFicha.adicionarCampoManual).
export function normalizarChaveCampoFicha(chaveBruta: string): string {
  return chaveBruta.trim().toLowerCase().replace(/\s+/g, '_')
}

export type CampoManualEntrada = {
  // Ficha existente (só os campos que importam para a decisão) ou null quando
  // ainda não há ficha nenhuma para esta oportunidade.
  fichaExistente: Pick<ProspeccaoFicha, 'id' | 'status' | 'dados_confirmados'> | null
  chave: string
  valor: string
}

export type CampoManualPlano =
  | { tipo: 'inserir'; dados_confirmados: Record<string, unknown> }
  | { tipo: 'atualizar'; fichaId: string; dados_confirmados: Record<string, unknown>; status: ProspeccaoFicha['status'] }

// Decide se adicionar um campo manual é INSERT (primeira ficha) ou UPDATE
// (mescla no confirmado). Retorna null quando chave/valor são inválidos —
// a Action não grava nada nesse caso.
export function planejarCampoManualFicha(entrada: CampoManualEntrada): CampoManualPlano | null {
  const chave = normalizarChaveCampoFicha(entrada.chave)
  const valor = entrada.valor.trim()
  if (!chave || !valor) return null

  if (!entrada.fichaExistente) {
    return { tipo: 'inserir', dados_confirmados: { [chave]: valor } }
  }
  const dados_confirmados = { ...(entrada.fichaExistente.dados_confirmados || {}), [chave]: valor }
  const status: ProspeccaoFicha['status'] =
    entrada.fichaExistente.status === 'pendente' ? 'parcial' : entrada.fichaExistente.status
  return { tipo: 'atualizar', fichaId: entrada.fichaExistente.id, dados_confirmados, status }
}
