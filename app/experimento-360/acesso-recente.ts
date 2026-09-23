// Histórico local dos Processos abertos, só no navegador (nada no backend).
// A Visão Geral usa isto para mostrar os "3 mais recentemente acessados" —
// acesso = abrir o Processo, registrado em abrirProcesso (Sistema.tsx). É um
// sinal real de uso, não um indicador inventado; quando não há histórico, a
// Visão Geral cai para os Processos mais recentemente atualizados.

const CHAVE = 'experimento-360:processos-recentes'
const MAX = 12

export function lerAcessosRecentes(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return []
    const arr = JSON.parse(bruto)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function registrarAcesso(processoId: string): void {
  if (!processoId) return
  try {
    const semEste = lerAcessosRecentes().filter(id => id !== processoId)
    const novo = [processoId, ...semEste].slice(0, MAX)
    localStorage.setItem(CHAVE, JSON.stringify(novo))
  } catch {
    /* modo privado / storage indisponível — o fallback por updated_at cobre */
  }
}
