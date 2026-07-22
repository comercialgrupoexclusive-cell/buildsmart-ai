import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { obraAiToolDefs, execObraAiTool } from '@/lib/ai-obra-tools'

export const maxDuration = 60

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
type DB = NonNullable<ReturnType<typeof supabase>>

type Msg = { role: 'user' | 'assistant'; content: string }

// ─── Tools ───────────────────────────────────────────────────────────────────
function buildTools(): OpenAI.Chat.ChatCompletionTool[] {
  return [
    // Ferramentas de RDO / avanço / boletim (compartilhadas com o WhatsApp)
    ...obraAiToolDefs(true),
    {
      type: 'function',
      function: {
        name: 'listar_cronograma',
        description: 'Lista todas as etapas do cronograma da obra, com subetapas e serviços.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_etapas',
        description: 'Cria uma ou mais etapas no cronograma da obra.',
        parameters: {
          type: 'object',
          properties: {
            etapas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome da etapa' },
                  data_inicio: { type: 'string', description: 'Data de início YYYY-MM-DD (opcional)' },
                  data_fim: { type: 'string', description: 'Data de fim YYYY-MM-DD (opcional)' },
                },
                required: ['nome'],
              },
            },
          },
          required: ['etapas'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_subetapas',
        description: 'Cria subetapas dentro de uma etapa existente do cronograma.',
        parameters: {
          type: 'object',
          properties: {
            etapa_nome: { type: 'string', description: 'Nome da etapa pai (busca por semelhança)' },
            subetapas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome da subetapa' },
                  data_inicio: { type: 'string', description: 'Data início YYYY-MM-DD (opcional)' },
                  data_fim: { type: 'string', description: 'Data fim YYYY-MM-DD (opcional)' },
                  responsavel: { type: 'string', description: 'Nome do responsável (opcional)' },
                },
                required: ['nome'],
              },
            },
          },
          required: ['etapa_nome', 'subetapas'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_servicos',
        description: 'Cria serviços dentro de uma subetapa existente do cronograma.',
        parameters: {
          type: 'object',
          properties: {
            subetapa_nome: { type: 'string', description: 'Nome da subetapa pai (busca por semelhança)' },
            servicos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nome: { type: 'string', description: 'Nome do serviço' },
                  data_inicio: { type: 'string', description: 'Data início YYYY-MM-DD (opcional)' },
                  data_fim: { type: 'string', description: 'Data fim YYYY-MM-DD (opcional)' },
                },
                required: ['nome'],
              },
            },
          },
          required: ['subetapa_nome', 'servicos'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'alterar_etapa',
        description: 'Altera dados de uma etapa do cronograma (nome, datas, status, percentual).',
        parameters: {
          type: 'object',
          properties: {
            etapa_nome: { type: 'string', description: 'Nome atual da etapa (busca por semelhança)' },
            novo_nome: { type: 'string', description: 'Novo nome (opcional)' },
            data_inicio: { type: 'string', description: 'Nova data início YYYY-MM-DD (opcional)' },
            data_fim: { type: 'string', description: 'Nova data fim YYYY-MM-DD (opcional)' },
            status: { type: 'string', enum: ['planejada', 'em_andamento', 'concluida', 'atrasada'] },
            percentual_executado: { type: 'number', description: '0 a 100' },
          },
          required: ['etapa_nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'alterar_subetapa',
        description: 'Altera dados de uma subetapa do cronograma.',
        parameters: {
          type: 'object',
          properties: {
            subetapa_nome: { type: 'string', description: 'Nome atual da subetapa (busca por semelhança)' },
            novo_nome: { type: 'string', description: 'Novo nome (opcional)' },
            data_inicio: { type: 'string', description: 'Nova data início YYYY-MM-DD (opcional)' },
            data_fim: { type: 'string', description: 'Nova data fim YYYY-MM-DD (opcional)' },
            status: { type: 'string', enum: ['planejada', 'em_andamento', 'concluida', 'atrasada'] },
            percentual_executado: { type: 'number', description: '0 a 100' },
            responsavel: { type: 'string', description: 'Nome do responsável (opcional)' },
            is_marco: { type: 'boolean', description: 'Marcar como marco de projeto' },
          },
          required: ['subetapa_nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excluir_item_cronograma',
        description: 'Exclui uma etapa, subetapa ou serviço do cronograma pelo nome.',
        parameters: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['etapa', 'subetapa', 'servico'], description: 'Tipo do item a excluir' },
            nome: { type: 'string', description: 'Nome do item (busca por semelhança)' },
          },
          required: ['tipo', 'nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'listar_orcamento',
        description: 'Lista os itens do orçamento da obra agrupados por etapa.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'buscar_composicoes',
        description: 'Busca composições disponíveis (próprias e SINAPI) por texto para usar no orçamento.',
        parameters: {
          type: 'object',
          properties: {
            termo: { type: 'string', description: 'Texto de busca (código ou descrição)' },
          },
          required: ['termo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_item_orcamento',
        description: 'Adiciona uma composição ao orçamento da obra. Use buscar_composicoes primeiro para encontrar o ID correto.',
        parameters: {
          type: 'object',
          properties: {
            composicao_id: { type: 'string', description: 'UUID da composição (própria ou SINAPI)' },
            tipo_composicao: { type: 'string', enum: ['propria', 'sinapi'], description: 'Tipo da composição' },
            etapa_nome: { type: 'string', description: 'Nome da etapa (busca por semelhança, cria se não existir)' },
            subetapa: { type: 'string', description: 'Nome da subetapa/complemento (opcional, texto livre)' },
            quantidade: { type: 'number', description: 'Quantidade do serviço' },
          },
          required: ['composicao_id', 'tipo_composicao', 'quantidade'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'alterar_item_orcamento',
        description: 'Altera quantidade ou etapa de um item do orçamento.',
        parameters: {
          type: 'object',
          properties: {
            descricao_item: { type: 'string', description: 'Descrição ou código do item (busca por semelhança)' },
            quantidade: { type: 'number', description: 'Nova quantidade (opcional)' },
            etapa_nome: { type: 'string', description: 'Mover para outra etapa (opcional)' },
          },
          required: ['descricao_item'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excluir_item_orcamento',
        description: 'Remove um item do orçamento pelo nome/descrição.',
        parameters: {
          type: 'object',
          properties: {
            descricao_item: { type: 'string', description: 'Descrição ou código do item (busca por semelhança)' },
          },
          required: ['descricao_item'],
        },
      },
    },
  ]
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function findByName(db: DB, table: string, campo: string, nome: string, obraId: string, fkField = 'obra_id'): Promise<any | null> {
  const { data } = await db.from(table).select('*').eq(fkField, obraId).ilike(campo, `%${nome}%`).limit(1)
  return data?.[0] || null
}

// ─── Executor de funções ────────────────────────────────────────────────────
async function executeTool(db: DB, obraId: string, name: string, args: Record<string, any>): Promise<string> {
  try {
    // Ferramentas compartilhadas (RDO, avanço, boletim) — obra fixa
    const shared = await execObraAiTool(db, name, args, obraId)
    if (shared !== null) return shared

    switch (name) {

      case 'listar_cronograma': {
        const { data: etapas } = await db.from('etapas').select('id,nome,status,data_inicio,data_fim,percentual_executado,ordem').eq('obra_id', obraId).order('ordem')
        if (!etapas?.length) return 'Nenhuma etapa cadastrada no cronograma.'
        const lines: string[] = []
        for (const e of etapas) {
          lines.push(`📋 ${e.nome} (${e.status}, ${e.percentual_executado ?? 0}%)${e.data_inicio ? ` | ${e.data_inicio} a ${e.data_fim || '?'}` : ''}`)
          const { data: subs } = await db.from('subetapas_cronograma').select('id,nome,status,data_inicio,data_fim,percentual_executado,responsavel,is_marco').eq('etapa_id', e.id).order('ordem')
          for (const s of subs || []) {
            lines.push(`  ${s.is_marco ? '🚩' : '↳'} ${s.nome} (${s.status}, ${s.percentual_executado ?? 0}%)${s.responsavel ? ` [${s.responsavel}]` : ''}`)
            const { data: svcs } = await db.from('servicos_cronograma').select('nome,status,percentual_executado').eq('subetapa_id', s.id).order('ordem')
            for (const svc of svcs || []) {
              lines.push(`    • ${svc.nome} (${svc.status}, ${svc.percentual_executado ?? 0}%)`)
            }
          }
        }
        return lines.join('\n')
      }

      case 'criar_etapas': {
        const lista = args.etapas as any[]
        if (!lista?.length) return 'Nenhuma etapa informada.'
        const { count } = await db.from('etapas').select('*', { count: 'exact', head: true }).eq('obra_id', obraId)
        let ordem = count || 0
        const nomes: string[] = []
        for (const e of lista) {
          const { error } = await db.from('etapas').insert({
            obra_id: obraId, nome: e.nome, status: 'planejada', ordem: ordem++,
            data_inicio: e.data_inicio || null, data_fim: e.data_fim || null,
          })
          if (error) return `Erro ao criar "${e.nome}": ${error.message}`
          nomes.push(e.nome)
        }
        return `${nomes.length} etapa(s) criada(s): ${nomes.join(', ')}.`
      }

      case 'criar_subetapas': {
        const etapa = await findByName(db, 'etapas', 'nome', args.etapa_nome, obraId)
        if (!etapa) return `Etapa "${args.etapa_nome}" nao encontrada.`
        const lista = args.subetapas as any[]
        if (!lista?.length) return 'Nenhuma subetapa informada.'
        const { count } = await db.from('subetapas_cronograma').select('*', { count: 'exact', head: true }).eq('etapa_id', etapa.id)
        let ordem = count || 0
        const nomes: string[] = []
        for (const s of lista) {
          const { error } = await db.from('subetapas_cronograma').insert({
            etapa_id: etapa.id, nome: s.nome, status: 'planejada', ordem: ordem++,
            data_inicio: s.data_inicio || null, data_fim: s.data_fim || null,
            responsavel: s.responsavel || null, percentual_executado: 0,
          })
          if (error) return `Erro ao criar "${s.nome}": ${error.message}`
          nomes.push(s.nome)
        }
        return `${nomes.length} subetapa(s) criada(s) em "${etapa.nome}": ${nomes.join(', ')}.`
      }

      case 'criar_servicos': {
        const sub = await findByName(db, 'subetapas_cronograma', 'nome', args.subetapa_nome, obraId, 'etapa_id')
        if (!sub) {
          const { data: allSubs } = await db.from('subetapas_cronograma').select('id,nome,etapa_id').order('ordem')
          const etapaIds = (await db.from('etapas').select('id').eq('obra_id', obraId)).data?.map((e: any) => e.id) || []
          const match = (allSubs || []).find((s: any) => etapaIds.includes(s.etapa_id) && s.nome.toLowerCase().includes(String(args.subetapa_nome).toLowerCase()))
          if (!match) return `Subetapa "${args.subetapa_nome}" nao encontrada.`
          args._subId = match.id
        }
        const subId = sub?.id || args._subId
        const lista = args.servicos as any[]
        if (!lista?.length) return 'Nenhum servico informado.'
        const { count } = await db.from('servicos_cronograma').select('*', { count: 'exact', head: true }).eq('subetapa_id', subId)
        let ordem = count || 0
        const nomes: string[] = []
        for (const svc of lista) {
          const { error } = await db.from('servicos_cronograma').insert({
            subetapa_id: subId, nome: svc.nome, status: 'planejada', ordem: ordem++,
            data_inicio: svc.data_inicio || null, data_fim: svc.data_fim || null, percentual_executado: 0,
          })
          if (error) return `Erro ao criar "${svc.nome}": ${error.message}`
          nomes.push(svc.nome)
        }
        return `${nomes.length} servico(s) criado(s): ${nomes.join(', ')}.`
      }

      case 'alterar_etapa': {
        const etapa = await findByName(db, 'etapas', 'nome', args.etapa_nome, obraId)
        if (!etapa) return `Etapa "${args.etapa_nome}" nao encontrada.`
        const update: any = {}
        if (args.novo_nome) update.nome = args.novo_nome
        if (args.data_inicio) update.data_inicio = args.data_inicio
        if (args.data_fim) update.data_fim = args.data_fim
        if (args.status) update.status = args.status
        if (args.percentual_executado !== undefined) update.percentual_executado = args.percentual_executado
        if (!Object.keys(update).length) return 'Nenhuma alteracao informada.'
        const { error } = await db.from('etapas').update(update).eq('id', etapa.id)
        if (error) return `Erro: ${error.message}`
        return `Etapa "${etapa.nome}" atualizada.`
      }

      case 'alterar_subetapa': {
        const { data: allSubs } = await db.from('subetapas_cronograma').select('*').order('ordem')
        const etapaIds = (await db.from('etapas').select('id').eq('obra_id', obraId)).data?.map((e: any) => e.id) || []
        const sub = (allSubs || []).find((s: any) => etapaIds.includes(s.etapa_id) && s.nome.toLowerCase().includes(String(args.subetapa_nome).toLowerCase()))
        if (!sub) return `Subetapa "${args.subetapa_nome}" nao encontrada.`
        const update: any = {}
        if (args.novo_nome) update.nome = args.novo_nome
        if (args.data_inicio) update.data_inicio = args.data_inicio
        if (args.data_fim) update.data_fim = args.data_fim
        if (args.status) update.status = args.status
        if (args.percentual_executado !== undefined) update.percentual_executado = args.percentual_executado
        if (args.responsavel) update.responsavel = args.responsavel
        if (args.is_marco !== undefined) update.is_marco = args.is_marco
        if (!Object.keys(update).length) return 'Nenhuma alteracao informada.'
        const { error } = await db.from('subetapas_cronograma').update(update).eq('id', sub.id)
        if (error) return `Erro: ${error.message}`
        return `Subetapa "${sub.nome}" atualizada.`
      }

      case 'excluir_item_cronograma': {
        const tipo = args.tipo as string
        const nome = args.nome as string
        if (tipo === 'etapa') {
          const etapa = await findByName(db, 'etapas', 'nome', nome, obraId)
          if (!etapa) return `Etapa "${nome}" nao encontrada.`
          const { error } = await db.from('etapas').delete().eq('id', etapa.id)
          if (error) return `Erro: ${error.message}`
          return `Etapa "${etapa.nome}" excluida.`
        }
        if (tipo === 'subetapa') {
          const etapaIds = (await db.from('etapas').select('id').eq('obra_id', obraId)).data?.map((e: any) => e.id) || []
          const { data: allSubs } = await db.from('subetapas_cronograma').select('*').order('ordem')
          const sub = (allSubs || []).find((s: any) => etapaIds.includes(s.etapa_id) && s.nome.toLowerCase().includes(nome.toLowerCase()))
          if (!sub) return `Subetapa "${nome}" nao encontrada.`
          const { error } = await db.from('subetapas_cronograma').delete().eq('id', sub.id)
          if (error) return `Erro: ${error.message}`
          return `Subetapa "${sub.nome}" excluida.`
        }
        if (tipo === 'servico') {
          const etapaIds = (await db.from('etapas').select('id').eq('obra_id', obraId)).data?.map((e: any) => e.id) || []
          const { data: allSubs } = await db.from('subetapas_cronograma').select('id').in('etapa_id', etapaIds)
          const subIds = (allSubs || []).map((s: any) => s.id)
          const { data: allSvcs } = await db.from('servicos_cronograma').select('*').in('subetapa_id', subIds)
          const svc = (allSvcs || []).find((s: any) => s.nome.toLowerCase().includes(nome.toLowerCase()))
          if (!svc) return `Servico "${nome}" nao encontrado.`
          const { error } = await db.from('servicos_cronograma').delete().eq('id', svc.id)
          if (error) return `Erro: ${error.message}`
          return `Servico "${svc.nome}" excluido.`
        }
        return 'Tipo invalido. Use: etapa, subetapa ou servico.'
      }

      case 'listar_orcamento': {
        const { data: orcs } = await db.from('orcamentos').select('id').eq('obra_id', obraId).order('created_at', { ascending: false }).limit(1)
        if (!orcs?.length) return 'Nenhum orcamento encontrado para esta obra.'
        const orcId = orcs[0].id
        const { data: itens } = await db.from('orcamento_itens').select('id,etapa_id,subetapa,quantidade,preco_unitario_snapshot,descricao_snapshot,codigo_snapshot,unidade_snapshot').eq('orcamento_id', orcId).order('updated_at')
        if (!itens?.length) return 'Orcamento vazio — nenhum item cadastrado.'
        const { data: etapas } = await db.from('etapas').select('id,nome').eq('obra_id', obraId)
        const etapaMap = new Map((etapas || []).map((e: any) => [e.id, e.nome]))
        const porEtapa = new Map<string, any[]>()
        for (const item of itens) {
          const key = item.etapa_id ? (etapaMap.get(item.etapa_id) || 'Sem etapa') : 'Sem etapa'
          if (!porEtapa.has(key)) porEtapa.set(key, [])
          porEtapa.get(key)!.push(item)
        }
        const lines: string[] = []
        let total = 0
        for (const [etapa, lista] of porEtapa) {
          const subtotal = lista.reduce((s: number, i: any) => s + (i.quantidade * i.preco_unitario_snapshot), 0)
          total += subtotal
          lines.push(`\n📋 ${etapa} — R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
          for (const i of lista) {
            const t = i.quantidade * i.preco_unitario_snapshot
            lines.push(`  • ${i.codigo_snapshot || '—'} ${i.descricao_snapshot} | ${i.quantidade} ${i.unidade_snapshot || ''} × R$ ${i.preco_unitario_snapshot?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} = R$ ${t.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
          }
        }
        lines.unshift(`Orcamento: ${itens.length} itens — Total: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
        return lines.join('\n')
      }

      case 'buscar_composicoes': {
        const termo = String(args.termo || '').trim()
        if (!termo) return 'Informe um termo de busca.'
        const { data: proprias } = await db.from('composicoes_proprias').select('id,codigo,descricao,unidade').or(`descricao.ilike.%${termo}%,codigo.ilike.%${termo}%`).limit(5)
        const { data: sinapi } = await db.from('sinapi_composicoes').select('id,codigo,descricao,unidade').or(`descricao.ilike.%${termo}%,codigo.ilike.%${termo}%`).limit(5)
        const lines: string[] = []
        if (proprias?.length) {
          lines.push('Composicoes proprias:')
          for (const c of proprias) lines.push(`  [propria] ${c.codigo} — ${c.descricao} (${c.unidade}) | ID: ${c.id}`)
        }
        if (sinapi?.length) {
          lines.push('Composicoes SINAPI:')
          for (const c of sinapi) lines.push(`  [sinapi] ${c.codigo} — ${c.descricao} (${c.unidade}) | ID: ${c.id}`)
        }
        if (!lines.length) return `Nenhuma composicao encontrada para "${termo}".`
        return lines.join('\n')
      }

      case 'criar_item_orcamento': {
        const { data: orcs } = await db.from('orcamentos').select('id').eq('obra_id', obraId).order('created_at', { ascending: false }).limit(1)
        if (!orcs?.length) return 'Nenhum orcamento encontrado. Crie um orcamento primeiro.'
        const orcId = orcs[0].id
        const compId = args.composicao_id as string
        const tipo = args.tipo_composicao as string
        const quantidade = Number(args.quantidade) || 1

        let descricao = '', codigo = '', unidade = '', preco = 0
        if (tipo === 'propria') {
          const { data } = await db.from('composicoes_proprias').select('*').eq('id', compId).single()
          if (!data) return 'Composicao propria nao encontrada com esse ID.'
          descricao = data.descricao; codigo = data.codigo; unidade = data.unidade; preco = data.custo_unitario || 0
        } else {
          const { data } = await db.from('sinapi_composicoes').select('*').eq('id', compId).single()
          if (!data) return 'Composicao SINAPI nao encontrada com esse ID.'
          descricao = data.descricao; codigo = data.codigo; unidade = data.unidade; preco = data.custo_unitario || 0
        }

        let etapaId: string | null = null
        if (args.etapa_nome) {
          const etapa = await findByName(db, 'etapas', 'nome', args.etapa_nome, obraId)
          if (etapa) {
            etapaId = etapa.id
          } else {
            const { count } = await db.from('etapas').select('*', { count: 'exact', head: true }).eq('obra_id', obraId)
            const { data: novaEtapa } = await db.from('etapas').insert({
              obra_id: obraId, nome: args.etapa_nome, status: 'planejada', ordem: (count || 0),
            }).select('id').single()
            if (novaEtapa) etapaId = novaEtapa.id
          }
        }

        const { error } = await db.from('orcamento_itens').insert({
          orcamento_id: orcId,
          etapa_id: etapaId,
          subetapa: args.subetapa || null,
          composicao_id: tipo === 'propria' ? compId : null,
          sinapi_composicao_id: tipo === 'sinapi' ? compId : null,
          quantidade,
          preco_unitario_snapshot: preco,
          descricao_snapshot: descricao,
          codigo_snapshot: codigo,
          unidade_snapshot: unidade,
        })
        if (error) return `Erro ao adicionar: ${error.message}`
        const total = quantidade * preco
        return `Item adicionado ao orcamento: ${codigo} — ${descricao} | ${quantidade} ${unidade} × R$ ${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} = R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${etapaId ? ` (Etapa: ${args.etapa_nome})` : ''}`
      }

      case 'alterar_item_orcamento': {
        const { data: orcs } = await db.from('orcamentos').select('id').eq('obra_id', obraId).order('created_at', { ascending: false }).limit(1)
        if (!orcs?.length) return 'Nenhum orcamento encontrado.'
        const { data: itens } = await db.from('orcamento_itens').select('*').eq('orcamento_id', orcs[0].id)
        const desc = String(args.descricao_item).toLowerCase()
        const item = (itens || []).find((i: any) =>
          (i.descricao_snapshot || '').toLowerCase().includes(desc) || (i.codigo_snapshot || '').toLowerCase().includes(desc)
        )
        if (!item) return `Item "${args.descricao_item}" nao encontrado no orcamento.`
        const update: any = {}
        if (args.quantidade !== undefined) update.quantidade = args.quantidade
        if (args.etapa_nome) {
          const etapa = await findByName(db, 'etapas', 'nome', args.etapa_nome, obraId)
          if (etapa) update.etapa_id = etapa.id
        }
        if (!Object.keys(update).length) return 'Nenhuma alteracao informada.'
        const { error } = await db.from('orcamento_itens').update(update).eq('id', item.id)
        if (error) return `Erro: ${error.message}`
        return `Item "${item.descricao_snapshot}" atualizado.`
      }

      case 'excluir_item_orcamento': {
        const { data: orcs } = await db.from('orcamentos').select('id').eq('obra_id', obraId).order('created_at', { ascending: false }).limit(1)
        if (!orcs?.length) return 'Nenhum orcamento encontrado.'
        const { data: itens } = await db.from('orcamento_itens').select('*').eq('orcamento_id', orcs[0].id)
        const desc = String(args.descricao_item).toLowerCase()
        const item = (itens || []).find((i: any) =>
          (i.descricao_snapshot || '').toLowerCase().includes(desc) || (i.codigo_snapshot || '').toLowerCase().includes(desc)
        )
        if (!item) return `Item "${args.descricao_item}" nao encontrado no orcamento.`
        const { error } = await db.from('orcamento_itens').delete().eq('id', item.id)
        if (error) return `Erro: ${error.message}`
        return `Item "${item.descricao_snapshot}" removido do orcamento.`
      }

      default:
        return `Funcao "${name}" nao reconhecida.`
    }
  } catch (err: any) {
    return `Erro interno: ${err?.message || 'desconhecido'}`
  }
}

// ─── POST handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { obraId, messages = [], obraNome = '', obraUf = 'SP' } = await req.json() as {
      obraId: string
      messages: Msg[]
      obraNome?: string
      obraUf?: string
    }

    if (!obraId || !messages.length) {
      return NextResponse.json({ error: 'obraId e messages sao obrigatorios' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return NextResponse.json({ error: 'OPENAI_API_KEY nao configurada' }, { status: 500 })
    }

    const db = supabase()
    if (!db) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })
    const hoje = new Date().toLocaleDateString('pt-BR')

    const systemPrompt = `Voce e a Luiza, assistente IA da BuildSmart AI para gestao de obras.

DATA ATUAL: ${hoje}
OBRA ATUAL: "${obraNome}" (UF: ${obraUf})

CAPACIDADES:
- Voce pode criar, alterar e excluir etapas, subetapas e servicos no CRONOGRAMA.
- Voce pode listar, adicionar, alterar e excluir itens no ORCAMENTO.
- Voce pode buscar composicoes (proprias e SINAPI) para adicionar ao orcamento.
- Voce pode registrar o RDO (diario de obra) do dia com clima, efetivo, equipamentos, atividades e ocorrencias (registrar_rdo).
- Voce pode atualizar o avanco fisico de qualquer item do cronograma pelo nome (atualizar_avanco).
- Voce pode criar e fechar boletins de medicao por periodo (criar_boletim, fechar_boletim).
- Use as funcoes disponiveis para executar acoes. Nao invente dados.

REGRAS:
- Responda sempre em portugues brasileiro.
- Seja pratica e objetiva. Maximo 4 blocos curtos.
- Ao criar itens, confirme o que foi criado com um resumo.
- Ao criar etapas para um tipo de obra, use etapas tipicas da construcao civil brasileira.
- Ao listar dados, formate de forma clara e organizada.
- Se o usuario pedir algo ambiguo, pergunte antes de executar.
- Para adicionar composicoes ao orcamento, busque primeiro com buscar_composicoes e use o ID retornado.
- Se nao encontrar uma composicao, informe e sugira alternativas.`

    const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    const tools = buildTools()
    let reply = ''
    let loopCount = 0

    while (loopCount < 6) {
      loopCount++
      const aiRes = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: oaiMessages,
        tools,
        tool_choice: 'auto',
        max_tokens: 1200,
      })

      const choice = aiRes.choices[0]

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        reply = choice.message.content?.trim() || ''
        break
      }

      oaiMessages.push(choice.message)
      const fnCalls = choice.message.tool_calls.filter(
        (t): t is OpenAI.Chat.ChatCompletionMessageToolCall & { type: 'function' } => t.type === 'function'
      )

      for (const tc of fnCalls) {
        let args: Record<string, any> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
        const result = await executeTool(db, obraId, tc.function.name, args)
        oaiMessages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    }

    if (!reply) {
      return NextResponse.json({ error: 'Resposta vazia da IA' }, { status: 500 })
    }

    return NextResponse.json({ message: reply, mode: 'openai', model: 'gpt-4o' })
  } catch (error: any) {
    console.error('obra-ai error:', error)
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 })
  }
}
