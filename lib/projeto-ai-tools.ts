import type { SupabaseClient } from '@supabase/supabase-js'
import type OpenAI from 'openai'
import { resolverComSeguranca, formatarAmbiguidade, type ResolveOutcome } from './ai-resolve'

type DB = SupabaseClient
type Args = Record<string, any>

export const PROJETO_AI_TOOL_NAMES = [
  'listar_estrutura',
  'criar_disciplina',
  'criar_item',
  'criar_subitem',
  'renomear_item',
  'excluir_item',
  'alterar_item',
  'alterar_predecessoras',
  'marcar_concluido',
]

export function projetoAiToolDefs(scoped: boolean): OpenAI.Chat.ChatCompletionTool[] {
  const projProp = scoped ? {} : { nome_projeto: { type: 'string', description: 'Nome ou parte do nome do projeto' } }
  const reqProj = scoped ? [] : ['nome_projeto']
  return [
    {
      type: 'function',
      function: {
        name: 'listar_estrutura',
        description: 'Lista toda a estrutura do projeto (disciplinas, itens e subitens) com status, datas e responsavel.',
        parameters: { type: 'object', properties: { ...projProp }, required: [...reqProj] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_disciplina',
        description: 'Cria uma ou mais disciplinas (nivel 1) no projeto.',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            disciplinas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome da disciplina' },
                  data_inicio: { type: 'string', description: 'Data de inicio YYYY-MM-DD (opcional)' },
                  data_prazo: { type: 'string', description: 'Data prazo YYYY-MM-DD (opcional)' },
                },
                required: ['nome'],
              },
            },
          },
          required: [...reqProj, 'disciplinas'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_item',
        description: 'Cria itens (nivel 2) dentro de uma disciplina existente.',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            disciplina_nome: { type: 'string', description: 'Nome da disciplina pai (busca por semelhanca)' },
            itens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nome: { type: 'string' },
                  data_inicio: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
                  data_prazo: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
                  responsavel: { type: 'string', description: 'UUID do responsavel (opcional)' },
                },
                required: ['nome'],
              },
            },
          },
          required: [...reqProj, 'disciplina_nome', 'itens'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_subitem',
        description: 'Cria subitens (nivel 3) dentro de um item existente.',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            item_nome: { type: 'string', description: 'Nome do item pai (busca por semelhanca)' },
            subitens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nome: { type: 'string' },
                  data_inicio: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
                  data_prazo: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
                },
                required: ['nome'],
              },
            },
          },
          required: [...reqProj, 'item_nome', 'subitens'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'renomear_item',
        description: 'Renomeia um item (disciplina, item ou subitem) do projeto.',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            nome_atual: { type: 'string', description: 'Nome atual do item (busca por semelhanca)' },
            novo_nome: { type: 'string', description: 'Novo nome' },
          },
          required: [...reqProj, 'nome_atual', 'novo_nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excluir_item',
        description: 'Exclui um item do projeto e todos os seus filhos.',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            nome: { type: 'string', description: 'Nome do item a excluir (busca por semelhanca)' },
          },
          required: [...reqProj, 'nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'alterar_item',
        description: 'Altera campos de um item do projeto: datas, status, responsavel, marco.',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            nome: { type: 'string', description: 'Nome do item (busca por semelhanca)' },
            data_inicio: { type: 'string', description: 'Nova data inicio YYYY-MM-DD' },
            data_prazo: { type: 'string', description: 'Nova data prazo YYYY-MM-DD' },
            status: { type: 'string', enum: ['pendente', 'em_andamento', 'concluido', 'atrasado'] },
            responsavel: { type: 'string', description: 'UUID do responsavel' },
            is_marco: { type: 'boolean', description: 'Marcar como marco' },
          },
          required: [...reqProj, 'nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'alterar_predecessoras',
        description: 'Define as predecessoras de um item (dependencias Fim-Inicio).',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            nome: { type: 'string', description: 'Nome do item (busca por semelhanca)' },
            predecessoras: {
              type: 'array',
              items: { type: 'string', description: 'Nome de cada predecessora (busca por semelhanca)' },
              description: 'Lista de nomes dos itens predecessores',
            },
          },
          required: [...reqProj, 'nome', 'predecessoras'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'marcar_concluido',
        description: 'Marca ou desmarca um item (e seus filhos) como concluido.',
        parameters: {
          type: 'object',
          properties: {
            ...projProp,
            nome: { type: 'string', description: 'Nome do item (busca por semelhanca)' },
            concluido: { type: 'boolean', description: 'true para concluir, false para reabrir' },
          },
          required: [...reqProj, 'nome', 'concluido'],
        },
      },
    },
  ]
}

// Segura: nunca escolhe sozinha entre dois projetos que batem no nome
// (ver lib/ai-resolve.ts) — substitui o antigo `ilike(...).limit(1)`.
export async function resolveProjetoSegura(db: DB, nome?: string): Promise<ResolveOutcome<{ id: string; nome: string }> | null> {
  if (!nome) return null
  const { data } = await db.from('projetos').select('id,nome').ilike('nome', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as { id: string; nome: string }[], p => p.nome)
}

async function resolveProjetoId(db: DB, args: Args, fixedId?: string): Promise<{ id: string; nome: string } | { ambigua: { id: string; nome: string }[] } | null> {
  if (fixedId) {
    const { data } = await db.from('projetos').select('id,nome').eq('id', fixedId).maybeSingle()
    return (data as any) || { id: fixedId, nome: 'projeto' }
  }
  const resolved = await resolveProjetoSegura(db, args.nome_projeto)
  if (!resolved || resolved.tipo === 'nao_encontrada') return null
  if (resolved.tipo === 'ambigua') return { ambigua: resolved.candidatos }
  return resolved.item
}

type FindItemResultado = { tipo: 'unica'; item: any } | { tipo: 'ambigua'; candidatos: any[] } | { tipo: 'nao_encontrada' }

// Segura: nunca escolhe sozinha entre dois itens/disciplinas/subitens do
// projeto que batem no nome — toda escrita (renomear, excluir, alterar,
// predecessoras, marcar concluído) passa por aqui.
async function findItem(db: DB, projetoId: string, nome: string): Promise<FindItemResultado> {
  const alvo = nome.toLowerCase()
  const { data } = await db.from('projeto_itens').select('*').eq('projeto_id', projetoId)
  if (!data?.length) return { tipo: 'nao_encontrada' }
  const match = data.filter((i: any) => i.nome.toLowerCase().includes(alvo))
  if (!match.length) return { tipo: 'nao_encontrada' }
  const r = resolverComSeguranca(nome, match, (i: any) => i.nome)
  if (r.tipo === 'unica') return { tipo: 'unica', item: r.item }
  if (r.tipo === 'ambigua') return { tipo: 'ambigua', candidatos: r.candidatos }
  return { tipo: 'nao_encontrada' }
}

function collectDescendantIds(all: any[], parentId: string): string[] {
  const children = all.filter((i: any) => i.parent_id === parentId)
  const ids: string[] = []
  for (const c of children) {
    ids.push(c.id)
    ids.push(...collectDescendantIds(all, c.id))
  }
  return ids
}

export async function execProjetoAiTool(db: DB, name: string, args: Args, fixedProjetoId?: string): Promise<string | null> {
  if (!PROJETO_AI_TOOL_NAMES.includes(name)) return null
  try {
    const projResolvido = await resolveProjetoId(db, args, fixedProjetoId)
    if (!projResolvido) return `Projeto "${args.nome_projeto || ''}" nao encontrado.`
    if ('ambigua' in projResolvido) return formatarAmbiguidade('projetos', args.nome_projeto, projResolvido.ambigua.map(p => p.nome))
    const proj = projResolvido

    switch (name) {
      case 'listar_estrutura': {
        const { data } = await db.from('projeto_itens').select('*').eq('projeto_id', proj.id).order('ordem')
        if (!data?.length) return `Projeto "${proj.nome}" nao tem itens na estrutura.`
        const byParent = new Map<string | null, any[]>()
        for (const i of data) {
          const key = i.parent_id || null
          if (!byParent.has(key)) byParent.set(key, [])
          byParent.get(key)!.push(i)
        }
        const lines: string[] = [`Estrutura de "${proj.nome}" (${data.length} itens):`]
        function printLevel(parentId: string | null, indent: string) {
          for (const item of byParent.get(parentId) || []) {
            const status = item.concluido ? 'Concluido' : (item.status || 'pendente')
            const datas = item.data_inicio ? ` | ${item.data_inicio} a ${item.data_prazo || '?'}` : ''
            const resp = item.responsavel ? ` [resp: ${item.responsavel}]` : ''
            const marco = item.is_marco ? ' (MARCO)' : ''
            lines.push(`${indent}${item.is_marco ? '🚩' : item.nivel === 1 ? '📋' : item.nivel === 2 ? '↳' : '•'} ${item.nome} (${status})${datas}${resp}${marco}`)
            printLevel(item.id, indent + '  ')
          }
        }
        printLevel(null, '')
        return lines.join('\n')
      }

      case 'criar_disciplina': {
        const lista = args.disciplinas as any[]
        if (!lista?.length) return 'Nenhuma disciplina informada.'
        const { data: existing } = await db.from('projeto_itens').select('ordem').eq('projeto_id', proj.id).is('parent_id', null).order('ordem', { ascending: false }).limit(1)
        let ordem = ((existing?.[0] as any)?.ordem ?? -1) + 1
        const nomes: string[] = []
        for (const d of lista) {
          const { error } = await db.from('projeto_itens').insert({
            projeto_id: proj.id, parent_id: null, nome: d.nome, nivel: 1, ordem: ordem++,
            data_inicio: d.data_inicio || null, data_prazo: d.data_prazo || null,
          })
          if (error) return `Erro ao criar "${d.nome}": ${error.message}`
          nomes.push(d.nome)
        }
        return `${nomes.length} disciplina(s) criada(s) em "${proj.nome}": ${nomes.join(', ')}.`
      }

      case 'criar_item': {
        const paiR = await findItem(db, proj.id, args.disciplina_nome)
        if (paiR.tipo === 'nao_encontrada') return `Disciplina "${args.disciplina_nome}" nao encontrada em "${proj.nome}".`
        if (paiR.tipo === 'ambigua') return formatarAmbiguidade('disciplinas', args.disciplina_nome, paiR.candidatos.map(c => c.nome))
        const pai = paiR.item
        const lista = args.itens as any[]
        if (!lista?.length) return 'Nenhum item informado.'
        const { data: existing } = await db.from('projeto_itens').select('ordem').eq('parent_id', pai.id).order('ordem', { ascending: false }).limit(1)
        let ordem = ((existing?.[0] as any)?.ordem ?? -1) + 1
        const nomes: string[] = []
        for (const it of lista) {
          const { error } = await db.from('projeto_itens').insert({
            projeto_id: proj.id, parent_id: pai.id, nome: it.nome, nivel: 2, ordem: ordem++,
            data_inicio: it.data_inicio || null, data_prazo: it.data_prazo || null,
            responsavel: it.responsavel || null,
          })
          if (error) return `Erro ao criar "${it.nome}": ${error.message}`
          nomes.push(it.nome)
        }
        return `${nomes.length} item(s) criado(s) em "${pai.nome}": ${nomes.join(', ')}.`
      }

      case 'criar_subitem': {
        const paiR = await findItem(db, proj.id, args.item_nome)
        if (paiR.tipo === 'nao_encontrada') return `Item "${args.item_nome}" nao encontrado em "${proj.nome}".`
        if (paiR.tipo === 'ambigua') return formatarAmbiguidade('itens', args.item_nome, paiR.candidatos.map(c => c.nome))
        const pai = paiR.item
        const lista = args.subitens as any[]
        if (!lista?.length) return 'Nenhum subitem informado.'
        const { data: existing } = await db.from('projeto_itens').select('ordem').eq('parent_id', pai.id).order('ordem', { ascending: false }).limit(1)
        let ordem = ((existing?.[0] as any)?.ordem ?? -1) + 1
        const nomes: string[] = []
        for (const si of lista) {
          const { error } = await db.from('projeto_itens').insert({
            projeto_id: proj.id, parent_id: pai.id, nome: si.nome, nivel: 3, ordem: ordem++,
            data_inicio: si.data_inicio || null, data_prazo: si.data_prazo || null,
          })
          if (error) return `Erro ao criar "${si.nome}": ${error.message}`
          nomes.push(si.nome)
        }
        return `${nomes.length} subitem(s) criado(s) em "${pai.nome}": ${nomes.join(', ')}.`
      }

      case 'renomear_item': {
        const itemR = await findItem(db, proj.id, args.nome_atual)
        if (itemR.tipo === 'nao_encontrada') return `Item "${args.nome_atual}" nao encontrado em "${proj.nome}".`
        if (itemR.tipo === 'ambigua') return formatarAmbiguidade('itens', args.nome_atual, itemR.candidatos.map(c => c.nome))
        const item = itemR.item
        const { error } = await db.from('projeto_itens').update({ nome: args.novo_nome }).eq('id', item.id)
        if (error) return `Erro: ${error.message}`
        return `"${item.nome}" renomeado para "${args.novo_nome}".`
      }

      case 'excluir_item': {
        const itemR = await findItem(db, proj.id, args.nome)
        if (itemR.tipo === 'nao_encontrada') return `Item "${args.nome}" nao encontrado em "${proj.nome}".`
        if (itemR.tipo === 'ambigua') return formatarAmbiguidade('itens', args.nome, itemR.candidatos.map(c => c.nome))
        const item = itemR.item
        const { data: allItens } = await db.from('projeto_itens').select('id,parent_id').eq('projeto_id', proj.id)
        const descendantIds = collectDescendantIds(allItens || [], item.id)
        const allIds = [item.id, ...descendantIds]
        await db.from('projeto_itens').delete().in('id', allIds)
        return `"${item.nome}" excluido${descendantIds.length > 0 ? ` (+ ${descendantIds.length} filho(s))` : ''}.`
      }

      case 'alterar_item': {
        const itemR = await findItem(db, proj.id, args.nome)
        if (itemR.tipo === 'nao_encontrada') return `Item "${args.nome}" nao encontrado em "${proj.nome}".`
        if (itemR.tipo === 'ambigua') return formatarAmbiguidade('itens', args.nome, itemR.candidatos.map(c => c.nome))
        const item = itemR.item
        const update: any = {}
        if (args.data_inicio) update.data_inicio = args.data_inicio
        if (args.data_prazo) update.data_prazo = args.data_prazo
        if (args.status) update.status = args.status
        if (args.responsavel) update.responsavel = args.responsavel
        if (args.is_marco !== undefined) update.is_marco = args.is_marco
        if (!Object.keys(update).length) return 'Nenhuma alteracao informada.'
        const { error } = await db.from('projeto_itens').update(update).eq('id', item.id)
        if (error) return `Erro: ${error.message}`
        const changes = Object.entries(update).map(([k, v]) => `${k}=${v}`).join(', ')
        return `"${item.nome}" atualizado: ${changes}.`
      }

      case 'alterar_predecessoras': {
        const itemR = await findItem(db, proj.id, args.nome)
        if (itemR.tipo === 'nao_encontrada') return `Item "${args.nome}" nao encontrado em "${proj.nome}".`
        if (itemR.tipo === 'ambigua') return formatarAmbiguidade('itens', args.nome, itemR.candidatos.map(c => c.nome))
        const item = itemR.item
        const predNomes = args.predecessoras as string[]
        const predIds: string[] = []
        const notFound: string[] = []
        const ambiguous: string[] = []
        for (const pn of predNomes) {
          const predR = await findItem(db, proj.id, pn)
          if (predR.tipo === 'unica') predIds.push(predR.item.id)
          else if (predR.tipo === 'ambigua') ambiguous.push(pn)
          else notFound.push(pn)
        }
        await db.from('projeto_item_dependencias').delete().eq('item_id', item.id)
        if (predIds.length > 0) {
          await db.from('projeto_item_dependencias').insert(
            predIds.map(pid => ({ projeto_id: proj.id, item_id: item.id, predecessor_id: pid }))
          )
        }
        let msg = `Predecessoras de "${item.nome}" atualizadas: ${predIds.length} predecessora(s).`
        if (notFound.length > 0) msg += ` Nao encontrados: ${notFound.join(', ')}.`
        if (ambiguous.length > 0) msg += ` Ambiguos (nome bate em mais de um item, nao incluidos): ${ambiguous.join(', ')}.`
        return msg
      }

      case 'marcar_concluido': {
        const itemR = await findItem(db, proj.id, args.nome)
        if (itemR.tipo === 'nao_encontrada') return `Item "${args.nome}" nao encontrado em "${proj.nome}".`
        if (itemR.tipo === 'ambigua') return formatarAmbiguidade('itens', args.nome, itemR.candidatos.map(c => c.nome))
        const item = itemR.item
        const concluido = !!args.concluido
        const { data: allItens } = await db.from('projeto_itens').select('id,parent_id').eq('projeto_id', proj.id)
        const descendantIds = collectDescendantIds(allItens || [], item.id)
        const allIds = [item.id, ...descendantIds]
        await db.from('projeto_itens').update({ concluido }).in('id', allIds)
        return `"${item.nome}" ${concluido ? 'marcado como concluido' : 'reaberto'}${descendantIds.length > 0 ? ` (+ ${descendantIds.length} filho(s))` : ''}.`
      }

      default:
        return null
    }
  } catch (err: any) {
    return `Erro ao executar ${name}: ${err?.message || 'desconhecido'}`
  }
}
