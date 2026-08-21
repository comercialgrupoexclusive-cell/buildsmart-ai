// ═══════════════════════════════════════════════════════════════════════════
// Ferramentas de IA (function-calling) para RDO, avanço físico e boletim de
// medição — COMPARTILHADAS entre o agente in-app (obra-ai) e o WhatsApp
// (webhook). Assim os dois canais executam exatamente a mesma lógica.
//
// Modo "escopado" (obra-ai): a obra já é fixa (obraId), sem nome_obra.
// Modo "global" (WhatsApp): resolve a obra pelo nome via arg nome_obra.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import type OpenAI from 'openai'
import { loadObraProgresso, propagarAvancoServicos, clampPct } from './obra-progresso'
import { resolverComSeguranca, formatarAmbiguidade, type ResolveOutcome } from './ai-resolve'

type DB = SupabaseClient
type Args = Record<string, any>

const hoje = () => new Date().toISOString().slice(0, 10)
const statusDe = (p: number) => (p >= 100 ? 'concluida' : p > 0 ? 'em_andamento' : 'planejada')
const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Nomes das ferramentas deste módulo (para o roteador saber quais tratar aqui)
export const OBRA_AI_TOOL_NAMES = ['registrar_rdo', 'atualizar_avanco', 'criar_boletim', 'fechar_boletim', 'listar_rdos']

// ─── Definições das tools ────────────────────────────────────────────────────
export function obraAiToolDefs(scoped: boolean): OpenAI.Chat.ChatCompletionTool[] {
  const obraProp = scoped ? {} : { nome_obra: { type: 'string', description: 'Nome ou parte do nome da obra' } }
  const reqObra = scoped ? [] : ['nome_obra']
  return [
    {
      type: 'function',
      function: {
        name: 'registrar_rdo',
        description: 'Registra o RDO (Relatório Diário de Obra) do dia: clima, efetivo (mão de obra), equipamentos, atividades executadas (ligadas ao cronograma), materiais recebidos e ocorrências. As atividades com percentual atualizam o avanço do cronograma automaticamente. Use quando o usuário descrever o que aconteceu na obra no dia.',
        parameters: {
          type: 'object',
          properties: {
            ...obraProp,
            data: { type: 'string', description: 'Data do RDO YYYY-MM-DD (padrão: hoje)' },
            clima_manha: { type: 'string', enum: ['sol', 'nublado', 'chuva', 'impraticavel'], description: 'Clima da manhã' },
            clima_tarde: { type: 'string', enum: ['sol', 'nublado', 'chuva', 'impraticavel'], description: 'Clima da tarde' },
            condicao_trabalho: { type: 'string', enum: ['praticavel', 'parcial', 'impraticavel'], description: 'Condição de trabalho do dia' },
            efetivo: {
              type: 'array', description: 'Mão de obra presente',
              items: { type: 'object', properties: {
                funcao: { type: 'string', description: 'Ex.: pedreiro, servente, eletricista' },
                quantidade: { type: 'number' },
                empresa: { type: 'string', description: 'Empresa/equipe (opcional)' },
              }, required: ['funcao', 'quantidade'] },
            },
            equipamentos: {
              type: 'array', description: 'Equipamentos em operação',
              items: { type: 'object', properties: {
                nome: { type: 'string' }, quantidade: { type: 'number' },
              }, required: ['nome', 'quantidade'] },
            },
            atividades: {
              type: 'array', description: 'Serviços do cronograma trabalhados no dia. Informe o percentual quando o usuário disser o avanço.',
              items: { type: 'object', properties: {
                servico: { type: 'string', description: 'Nome do serviço/etapa do cronograma (busca por semelhança)' },
                percentual: { type: 'number', description: 'Novo % de execução do serviço (0-100), opcional' },
              }, required: ['servico'] },
            },
            servicos_executados: { type: 'string', description: 'Resumo em texto do que foi feito (opcional)' },
            materiais_recebidos: { type: 'string', description: 'Materiais que chegaram no canteiro (opcional)' },
            ocorrencias: { type: 'string', description: 'Atrasos, acidentes, fiscalização, paralisação (opcional)' },
          },
          required: [...reqObra],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'atualizar_avanco',
        description: 'Atualiza o percentual de execução de um item do cronograma (serviço, subetapa ou etapa) pelo nome. Propaga o avanço para cima. Use quando o usuário disser algo como "a fundação está 80%" ou "terminei o reboco interno".',
        parameters: {
          type: 'object',
          properties: {
            ...obraProp,
            item: { type: 'string', description: 'Nome do serviço, subetapa ou etapa (busca por semelhança)' },
            percentual: { type: 'number', description: 'Percentual de execução (0-100)' },
          },
          required: [...reqObra, 'item', 'percentual'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_boletim',
        description: 'Cria um boletim de medição (rascunho) para um período. Depois use fechar_boletim para congelar o avanço.',
        parameters: {
          type: 'object',
          properties: {
            ...obraProp,
            nome: { type: 'string', description: 'Nome do boletim (opcional, ex.: "Medição de Julho")' },
            periodo_inicio: { type: 'string', description: 'Início do período YYYY-MM-DD' },
            periodo_fim: { type: 'string', description: 'Fim do período YYYY-MM-DD' },
          },
          required: [...reqObra, 'periodo_inicio', 'periodo_fim'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fechar_boletim',
        description: 'Fecha um boletim de medição, congelando o avanço atual do cronograma como a medição do período (calcula saldo e valor).',
        parameters: {
          type: 'object',
          properties: {
            ...obraProp,
            numero: { type: 'number', description: 'Número do boletim (padrão: o último em rascunho)' },
          },
          required: [...reqObra],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'listar_rdos',
        description: 'Lista os últimos RDOs (relatórios diários) da obra.',
        parameters: {
          type: 'object',
          properties: { ...obraProp },
          required: [...reqObra],
        },
      },
    },
  ]
}

// ─── Resolução de obra (modo global) ─────────────────────────────────────────
// Segura: nunca escolhe sozinha entre duas obras que batem no nome (ver
// lib/ai-resolve.ts) — corrige o padrão antigo `ilike(...).limit(1)`, que
// escolhia uma linha arbitrária do Postgres quando havia homônimos.
export async function resolveObraSegura(db: DB, nome?: string): Promise<ResolveOutcome<{ id: string; nome: string }> | null> {
  if (!nome) return null
  const { data } = await db.from('obras').select('id,nome').ilike('nome', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as { id: string; nome: string }[], o => o.nome)
}

async function resolveObraId(db: DB, args: Args, fixedObraId?: string): Promise<{ id: string; nome: string } | { ambigua: { id: string; nome: string }[] } | null> {
  if (fixedObraId) {
    const { data } = await db.from('obras').select('id,nome').eq('id', fixedObraId).maybeSingle()
    return (data as any) || { id: fixedObraId, nome: 'obra' }
  }
  const resolved = await resolveObraSegura(db, args.nome_obra)
  if (!resolved || resolved.tipo === 'nao_encontrada') return null
  if (resolved.tipo === 'ambigua') return { ambigua: resolved.candidatos }
  return resolved.item
}

type ItemCronogramaAlvo = { tipo: 'servico' | 'subetapa' | 'etapa'; id: string; nome: string }
type AcharItemResultado = { tipo: 'unica'; item: ItemCronogramaAlvo } | { tipo: 'ambigua'; candidatos: ItemCronogramaAlvo[] } | { tipo: 'nao_encontrada' }

// Acha um item do cronograma (serviço → subetapa → etapa) por nome. Dentro de
// cada nível, nunca escolhe sozinha entre duas correspondências reais — uma
// escrita (avanço físico) na entidade errada é justamente o risco que este
// pacote de correções elimina.
async function acharItem(db: DB, obraId: string, nome: string): Promise<AcharItemResultado> {
  const alvo = nome.toLowerCase()
  const { data: etapas } = await db.from('etapas').select('id,nome').eq('obra_id', obraId)
  const etapaIds = (etapas || []).map((e: any) => e.id)
  if (etapaIds.length === 0) return { tipo: 'nao_encontrada' }
  const { data: subs } = await db.from('subetapas_cronograma').select('id,nome,etapa_id').in('etapa_id', etapaIds)
  const subIds = (subs || []).map((s: any) => s.id)
  const { data: svcs } = subIds.length ? await db.from('servicos_cronograma').select('id,nome,subetapa_id').in('subetapa_id', subIds) : { data: [] }

  // prioridade: serviço > subetapa > etapa — só cai pro próximo nível se não
  // houver NENHUMA correspondência no nível atual (ambiguidade não cai, pede
  // desambiguação em vez de tentar o nível de baixo).
  const svcsMatch = (svcs || []).filter((s: any) => s.nome.toLowerCase().includes(alvo))
  if (svcsMatch.length) {
    const r = resolverComSeguranca(nome, svcsMatch, (s: any) => s.nome)
    if (r.tipo === 'unica') return { tipo: 'unica', item: { tipo: 'servico', id: r.item.id, nome: r.item.nome } }
    if (r.tipo === 'ambigua') return { tipo: 'ambigua', candidatos: r.candidatos.map((s: any) => ({ tipo: 'servico' as const, id: s.id, nome: s.nome })) }
  }
  const subsMatch = (subs || []).filter((s: any) => s.nome.toLowerCase().includes(alvo))
  if (subsMatch.length) {
    const r = resolverComSeguranca(nome, subsMatch, (s: any) => s.nome)
    if (r.tipo === 'unica') return { tipo: 'unica', item: { tipo: 'subetapa', id: r.item.id, nome: r.item.nome } }
    if (r.tipo === 'ambigua') return { tipo: 'ambigua', candidatos: r.candidatos.map((s: any) => ({ tipo: 'subetapa' as const, id: s.id, nome: s.nome })) }
  }
  const etapasMatch = (etapas || []).filter((e: any) => e.nome.toLowerCase().includes(alvo))
  if (etapasMatch.length) {
    const r = resolverComSeguranca(nome, etapasMatch, (e: any) => e.nome)
    if (r.tipo === 'unica') return { tipo: 'unica', item: { tipo: 'etapa', id: r.item.id, nome: r.item.nome } }
    if (r.tipo === 'ambigua') return { tipo: 'ambigua', candidatos: r.candidatos.map((e: any) => ({ tipo: 'etapa' as const, id: e.id, nome: e.nome })) }
  }
  return { tipo: 'nao_encontrada' }
}

// Aplica avanço em qualquer nível, com propagação (mesma regra do app)
async function aplicarAvanco(db: DB, obraId: string, item: { tipo: string; id: string }, pct: number) {
  const v = clampPct(pct)
  if (item.tipo === 'servico') {
    await propagarAvancoServicos(db, obraId, [{ servicoId: item.id, percentual: v }])
  } else if (item.tipo === 'subetapa') {
    const { data: svcs } = await db.from('servicos_cronograma').select('id').eq('subetapa_id', item.id)
    if ((svcs || []).length > 0) {
      await propagarAvancoServicos(db, obraId, (svcs as any[]).map(s => ({ servicoId: s.id, percentual: v })))
    } else {
      await db.from('subetapas_cronograma').update({ percentual_executado: v, status: statusDe(v) }).eq('id', item.id)
      const { data: sub } = await db.from('subetapas_cronograma').select('etapa_id').eq('id', item.id).maybeSingle()
      const etapaId = (sub as any)?.etapa_id
      if (etapaId) {
        const { data: subs } = await db.from('subetapas_cronograma').select('percentual_executado').eq('etapa_id', etapaId)
        const media = (subs as any[]).reduce((a, b) => a + Number(b.percentual_executado), 0) / Math.max(1, (subs as any[]).length)
        await db.from('etapas').update({ percentual_executado: media, status: statusDe(media) }).eq('id', etapaId)
      }
    }
  } else {
    // etapa: espalha para todos os filhos
    await db.from('etapas').update({ percentual_executado: v, status: statusDe(v) }).eq('id', item.id)
    const { data: subs } = await db.from('subetapas_cronograma').select('id').eq('etapa_id', item.id)
    const subIds = (subs || []).map((s: any) => s.id)
    if (subIds.length) {
      await db.from('subetapas_cronograma').update({ percentual_executado: v, status: statusDe(v) }).in('id', subIds)
      await db.from('servicos_cronograma').update({ percentual_executado: v }).in('subetapa_id', subIds)
    }
  }
}

// ─── Executor ────────────────────────────────────────────────────────────────
// Retorna string com o resultado, ou null se `name` não for uma tool deste módulo.
export async function execObraAiTool(db: DB, name: string, args: Args, fixedObraId?: string): Promise<string | null> {
  if (!OBRA_AI_TOOL_NAMES.includes(name)) return null
  try {
    const obraResolvida = await resolveObraId(db, args, fixedObraId)
    if (!obraResolvida) return `Obra "${args.nome_obra || ''}" não encontrada. Diga o nome da obra.`
    if ('ambigua' in obraResolvida) return formatarAmbiguidade('obras', args.nome_obra, obraResolvida.ambigua.map(o => o.nome))
    const obra = obraResolvida

    switch (name) {
      case 'registrar_rdo': {
        // Resolve atividades → serviços do cronograma
        const atividades: any[] = []
        const avancos: { servicoId: string; percentual: number }[] = []
        const ambiguas: string[] = []
        for (const a of (args.atividades || []) as Args[]) {
          const item = await acharItem(db, obra.id, String(a.servico || ''))
          if (item.tipo === 'unica' && item.item.tipo === 'servico') {
            atividades.push({ item_tipo: 'servico', item_id: item.item.id, nome: item.item.nome, percentual: a.percentual })
            if (typeof a.percentual === 'number') avancos.push({ servicoId: item.item.id, percentual: a.percentual })
          } else if (item.tipo === 'unica') {
            atividades.push({ item_tipo: 'servico', item_id: '', nome: String(a.servico || ''), percentual: a.percentual })
            // casou em subetapa/etapa (não em serviço) — ainda aplica avanço, é uma correspondência única
            if (typeof a.percentual === 'number') await aplicarAvanco(db, obra.id, item.item, a.percentual)
          } else {
            // ambígua ou não encontrada: registra a atividade no texto do RDO,
            // mas NÃO aplica avanço em nenhum item — evitaria adivinhar entre
            // duas correspondências reais no cronograma.
            atividades.push({ item_tipo: 'servico', item_id: '', nome: String(a.servico || ''), percentual: a.percentual })
            if (item.tipo === 'ambigua') ambiguas.push(String(a.servico || ''))
          }
        }

        const { data: max } = await db.from('rdo').select('numero').eq('obra_id', obra.id).order('numero', { ascending: false, nullsFirst: false }).limit(1)
        const numero = (((max?.[0] as any)?.numero as number) || 0) + 1
        const totalEfetivo = ((args.efetivo || []) as Args[]).reduce((s, e) => s + (Number(e.quantidade) || 0), 0)

        const { error } = await db.from('rdo').insert({
          obra_id: obra.id,
          numero,
          data: args.data || hoje(),
          clima_manha: args.clima_manha || null,
          clima_tarde: args.clima_tarde || null,
          condicao_trabalho: args.condicao_trabalho || 'praticavel',
          efetivo: args.efetivo || [],
          equipamentos: args.equipamentos || [],
          atividades,
          servicos_executados: args.servicos_executados || null,
          equipe_presente: totalEfetivo > 0 ? `${totalEfetivo} no efetivo` : null,
          materiais_recebidos: args.materiais_recebidos || null,
          ocorrencias: args.ocorrencias || null,
          fotos: [],
          updated_at: new Date().toISOString(),
        })
        if (error) return `Erro ao registrar RDO: ${error.message}`
        if (avancos.length > 0) await propagarAvancoServicos(db, obra.id, avancos)

        const partes = [`RDO ${numero} registrado na obra "${obra.nome}" (${args.data || hoje()}).`]
        if (totalEfetivo > 0) partes.push(`Efetivo: ${totalEfetivo}.`)
        if (atividades.length > 0) partes.push(`${atividades.length} atividade(s).`)
        if (avancos.length > 0) partes.push(`Avanço do cronograma atualizado em ${avancos.length} serviço(s).`)
        if (ambiguas.length > 0) partes.push(`Não atualizei o avanço de: ${ambiguas.join(', ')} (nome bate em mais de um item do cronograma — diga qual exatamente com atualizar_avanco).`)
        return partes.join(' ')
      }

      case 'atualizar_avanco': {
        const item = await acharItem(db, obra.id, String(args.item || ''))
        if (item.tipo === 'nao_encontrada') return `Item "${args.item}" não encontrado no cronograma de "${obra.nome}".`
        if (item.tipo === 'ambigua') return formatarAmbiguidade('itens do cronograma', String(args.item || ''), item.candidatos.map(c => c.nome))
        await aplicarAvanco(db, obra.id, item.item, Number(args.percentual))
        return `Avanço de "${item.item.nome}" (${item.item.tipo}) atualizado para ${clampPct(Number(args.percentual))}% na obra "${obra.nome}".`
      }

      case 'criar_boletim': {
        const { data: max } = await db.from('medicoes').select('numero').eq('obra_id', obra.id).order('numero', { ascending: false, nullsFirst: false }).limit(1)
        const numero = (((max?.[0] as any)?.numero as number) || 0) + 1
        const { error } = await db.from('medicoes').insert({
          obra_id: obra.id, numero, status: 'rascunho',
          nome: args.nome || `Medição ${numero}`,
          periodo_inicio: args.periodo_inicio, periodo_fim: args.periodo_fim,
          percentual_executado: 0, fotos: [], updated_at: new Date().toISOString(),
        })
        if (error) return `Erro ao criar boletim: ${error.message}`
        return `Boletim de medição nº ${numero} criado (rascunho) na obra "${obra.nome}", período ${args.periodo_inicio} a ${args.periodo_fim}. Use "fechar boletim" para congelar a medição.`
      }

      case 'fechar_boletim': {
        // Acha o boletim: pelo número, ou o último rascunho
        let query = db.from('medicoes').select('*').eq('obra_id', obra.id).eq('status', 'rascunho')
        if (args.numero != null) query = db.from('medicoes').select('*').eq('obra_id', obra.id).eq('numero', args.numero)
        const { data: bols } = await query.order('numero', { ascending: false, nullsFirst: false }).limit(1)
        const bol = bols?.[0] as any
        if (!bol) return `Nenhum boletim ${args.numero != null ? `nº ${args.numero}` : 'em rascunho'} encontrado em "${obra.nome}".`

        const prog = await loadObraProgresso(db, obra.id)
        // acumulado anterior por etapa (de boletins já fechados)
        const { data: anteriores } = await db
          .from('medicao_itens')
          .select('item_id, pct_atual, medicoes!inner(obra_id, status)')
          .eq('medicoes.obra_id', obra.id).eq('medicoes.status', 'fechada')
        const antePorEtapa: Record<string, number> = {}
        ;((anteriores || []) as any[]).forEach(r => { antePorEtapa[r.item_id] = Math.max(antePorEtapa[r.item_id] || 0, Number(r.pct_atual)) })

        const itens = prog.etapas.map(e => {
          const antes = antePorEtapa[e.id] || 0
          const delta = Math.max(0, e.percentual - antes)
          return { medicao_id: bol.id, item_tipo: 'etapa', item_id: e.id, nome: e.nome, valor_contratado: e.valorContratado, pct_anterior: antes, pct_atual: e.percentual, valor_periodo: (delta / 100) * e.valorContratado }
        })
        const valorPeriodo = itens.reduce((a, i) => a + i.valor_periodo, 0)
        const avancoPeriodo = prog.valorTotal > 0 ? itens.reduce((a, i) => a + (i.pct_atual - i.pct_anterior) * i.valor_contratado, 0) / prog.valorTotal : 0

        await db.from('medicao_itens').delete().eq('medicao_id', bol.id)
        if (itens.length) await db.from('medicao_itens').insert(itens)
        const { error } = await db.from('medicoes').update({
          status: 'fechada', percentual_executado: prog.avancoPonderado,
          avanco_acumulado: prog.avancoPonderado, avanco_periodo: avancoPeriodo,
          valor_periodo: valorPeriodo, valor_acumulado: prog.valorTotal * prog.avancoPonderado / 100,
          updated_at: new Date().toISOString(),
        }).eq('id', bol.id)
        if (error) return `Erro ao fechar boletim: ${error.message}`
        return `Boletim nº ${bol.numero} fechado em "${obra.nome}". Acumulado ${prog.avancoPonderado.toFixed(1)}%, avançou ${avancoPeriodo.toFixed(1)}% no período${prog.temValores ? ` (${brl(valorPeriodo)})` : ''}.`
      }

      case 'listar_rdos': {
        const { data } = await db.from('rdo').select('numero,data,ocorrencias,atividades').eq('obra_id', obra.id).order('data', { ascending: false }).limit(10)
        if (!data?.length) return `Nenhum RDO registrado em "${obra.nome}".`
        return `RDOs de "${obra.nome}":\n` + (data as any[]).map(r => `- RDO ${r.numero ?? '?'} (${r.data}): ${(r.atividades || []).length} atividade(s)${r.ocorrencias ? ` · ocorrência: ${r.ocorrencias}` : ''}`).join('\n')
      }

      default:
        return null
    }
  } catch (err: any) {
    return `Erro ao executar ${name}: ${err?.message || 'desconhecido'}`
  }
}
