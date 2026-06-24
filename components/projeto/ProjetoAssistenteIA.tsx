'use client'

import { useState, useEffect } from 'react'
import { Sparkles, CalendarRange, Send, Loader2, Check, X, Settings2, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { insertItensArvore, type ItemArvore } from '@/lib/projeto-itens'
import { DEFAULT_PROMPT_ESTRUTURA, DEFAULT_PROMPT_CRONOGRAMA } from '@/lib/projeto-ai-prompts'
import { useProfile } from '@/lib/profile-context'
import type { ProjetoItemNode } from '@/components/projeto/ProjetoCascata'

type ProjetoBasico = {
  id: string
  nome: string
  data_inicio: string | null
}

type Message = { role: 'user' | 'assistant'; content: string }

const NIVEL_LABEL = ['', 'Disciplina', 'Item', 'Subitem']

function PreviewArvore({ itens, nivel = 1 }: { itens: ItemArvore[]; nivel?: number }) {
  return (
    <ul className={nivel === 1 ? 'space-y-1.5' : 'space-y-1 mt-1 ml-4 border-l pl-3'} style={nivel > 1 ? { borderColor: 'var(--border)' } : undefined}>
      {itens.map((item, i) => (
        <li key={i}>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {NIVEL_LABEL[item.nivel] || `Nível ${item.nivel}`}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.nome}</span>
          </div>
          {item.children && item.children.length > 0 && (
            <PreviewArvore itens={item.children} nivel={nivel + 1} />
          )}
        </li>
      ))}
    </ul>
  )
}

export function ProjetoAssistenteIA({ projeto, itens, onReload }: {
  projeto: ProjetoBasico
  itens: ProjetoItemNode[]
  onReload: () => void
}) {
  const { currentProfile } = useProfile()
  const isAdmin = currentProfile?.tipo === 'admin'

  // Configuração dos prompts (somente ADM)
  const [promptEstrutura, setPromptEstrutura] = useState(DEFAULT_PROMPT_ESTRUTURA)
  const [promptCronograma, setPromptCronograma] = useState(DEFAULT_PROMPT_CRONOGRAMA)
  const [carregandoPrompts, setCarregandoPrompts] = useState(isAdmin)
  const [salvandoPrompts, setSalvandoPrompts] = useState(false)
  const [promptsSalvos, setPromptsSalvos] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    let ativo = true
    async function carregar() {
      const supabase = createClient()
      const { data } = await supabase.from('projeto_ia_config').select('key, value').in('key', ['prompt_estrutura', 'prompt_cronograma'])
      if (!ativo) return
      const porKey = new Map((data || []).map((d: { key: string; value: string }) => [d.key, d.value]))
      if (porKey.get('prompt_estrutura')) setPromptEstrutura(porKey.get('prompt_estrutura') as string)
      if (porKey.get('prompt_cronograma')) setPromptCronograma(porKey.get('prompt_cronograma') as string)
      setCarregandoPrompts(false)
    }
    carregar()
    return () => { ativo = false }
  }, [isAdmin])

  async function handleSalvarPrompts() {
    setSalvandoPrompts(true)
    setPromptsSalvos(false)
    try {
      const supabase = createClient()
      await Promise.all([
        supabase.from('projeto_ia_config').upsert({ key: 'prompt_estrutura', value: promptEstrutura, updated_at: new Date().toISOString() }),
        supabase.from('projeto_ia_config').upsert({ key: 'prompt_cronograma', value: promptCronograma, updated_at: new Date().toISOString() }),
      ])
      setPromptsSalvos(true)
    } finally {
      setSalvandoPrompts(false)
    }
  }

  // Estrutura
  const [descricao, setDescricao] = useState('')
  const [gerandoEstrutura, setGerandoEstrutura] = useState(false)
  const [estruturaSugerida, setEstruturaSugerida] = useState<ItemArvore[] | null>(null)
  const [erroEstrutura, setErroEstrutura] = useState<string | null>(null)
  const [aplicandoEstrutura, setAplicandoEstrutura] = useState(false)

  // Cronograma
  const [gerandoCronograma, setGerandoCronograma] = useState(false)
  const [datasSugeridas, setDatasSugeridas] = useState<{ id: string; nome: string; data_inicio: string; data_prazo: string }[] | null>(null)
  const [erroCronograma, setErroCronograma] = useState<string | null>(null)
  const [aplicandoCronograma, setAplicandoCronograma] = useState(false)

  // Chat
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleGerarEstrutura() {
    setGerandoEstrutura(true)
    setErroEstrutura(null)
    setEstruturaSugerida(null)
    try {
      const res = await fetch('/api/projetos/estrutura-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeProjeto: projeto.nome, descricao: descricao.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar estrutura')
      setEstruturaSugerida(data.itens)
    } catch (err) {
      setErroEstrutura(err instanceof Error ? err.message : 'Erro ao gerar estrutura')
    } finally {
      setGerandoEstrutura(false)
    }
  }

  async function handleAplicarEstrutura() {
    if (!estruturaSugerida) return
    setAplicandoEstrutura(true)
    try {
      const supabase = createClient()
      await insertItensArvore(supabase, projeto.id, estruturaSugerida, null, itens.filter(i => !i.parent_id).length)
      setEstruturaSugerida(null)
      setDescricao('')
      onReload()
    } finally {
      setAplicandoEstrutura(false)
    }
  }

  async function handleSugerirCronograma() {
    setGerandoCronograma(true)
    setErroCronograma(null)
    setDatasSugeridas(null)
    try {
      const payload = itens.map(i => ({
        id: i.id,
        nome: i.nome,
        nivel: i.nivel,
        parent_id: i.parent_id,
        data_inicio: i.data_inicio,
        data_prazo: i.data_prazo,
      }))
      const res = await fetch('/api/projetos/cronograma-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: payload, dataInicioObra: projeto.data_inicio }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao sugerir cronograma')
      if (!data.datas.length) {
        setErroCronograma('Todos os itens já têm datas preenchidas.')
        return
      }
      const porId = new Map(itens.map(i => [i.id, i.nome]))
      setDatasSugeridas(data.datas.map((d: { id: string; data_inicio: string; data_prazo: string }) => ({
        ...d,
        nome: porId.get(d.id) || d.id,
      })))
    } catch (err) {
      setErroCronograma(err instanceof Error ? err.message : 'Erro ao sugerir cronograma')
    } finally {
      setGerandoCronograma(false)
    }
  }

  function atualizarDataSugerida(id: string, campo: 'data_inicio' | 'data_prazo', valor: string) {
    setDatasSugeridas(prev => prev?.map(d => d.id === id ? { ...d, [campo]: valor } : d) ?? null)
  }

  async function handleAplicarCronograma() {
    if (!datasSugeridas) return
    setAplicandoCronograma(true)
    try {
      const supabase = createClient()
      await Promise.all(datasSugeridas.map(d =>
        supabase.from('projeto_itens').update({ data_inicio: d.data_inicio, data_prazo: d.data_prazo }).eq('id', d.id)
      ))
      setDatasSugeridas(null)
      onReload()
    } finally {
      setAplicandoCronograma(false)
    }
  }

  async function handleEnviarMensagem() {
    if (!input.trim() || enviando) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setEnviando(true)
    try {
      const res = await fetch('/api/buildassist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          complex: false,
          context: {
            modo: 'projeto',
            projetoAtual: projeto,
            itensProjeto: itens.slice(0, 200),
            observacao: 'Chat do assistente IA dentro de um projeto especifico. Contexto somente leitura.',
          },
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.message || 'Não consegui responder agora.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Não consegui conectar agora. Tente novamente.' }])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Configuração do prompt da IA — somente ADM */}
      {isAdmin && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Configuração do prompt da IA</h2>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Ajuste como a IA gera a estrutura e o cronograma. Visível apenas para administradores.
          </p>

          {carregandoPrompts ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 size={14} className="animate-spin" /> Carregando configuração…
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Prompt — Gerar estrutura</label>
                  <button
                    onClick={() => setPromptEstrutura(DEFAULT_PROMPT_ESTRUTURA)}
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <RotateCcw size={11} /> Restaurar padrão
                  </button>
                </div>
                <textarea
                  value={promptEstrutura}
                  onChange={e => setPromptEstrutura(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono border outline-none resize-y"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  rows={10}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Prompt — Sugerir cronograma</label>
                  <button
                    onClick={() => setPromptCronograma(DEFAULT_PROMPT_CRONOGRAMA)}
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <RotateCcw size={11} /> Restaurar padrão
                  </button>
                </div>
                <textarea
                  value={promptCronograma}
                  onChange={e => setPromptCronograma(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono border outline-none resize-y"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  rows={10}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSalvarPrompts}
                  disabled={salvandoPrompts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--accent)' }}
                >
                  <Check size={13} /> {salvandoPrompts ? 'Salvando…' : 'Salvar prompts'}
                </button>
                {promptsSalvos && (
                  <span className="text-xs" style={{ color: 'var(--accent)' }}>Configuração salva!</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gerar estrutura */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Gerar estrutura sugerida</h2>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          A IA sugere disciplinas, itens e subitens com base no nome e na descrição do projeto. Você revisa antes de aplicar.
        </p>
        <textarea
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="Descreva o tipo de obra (ex: reforma de apartamento 80m², construção residencial nova de 2 pavimentos...)"
          className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          rows={2}
          disabled={gerandoEstrutura}
        />
        <button
          onClick={handleGerarEstrutura}
          disabled={gerandoEstrutura}
          className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {gerandoEstrutura ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {gerandoEstrutura ? 'Gerando…' : 'Gerar com IA'}
        </button>

        {erroEstrutura && (
          <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{erroEstrutura}</p>
        )}

        {estruturaSugerida && (
          <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Pré-visualização da estrutura sugerida:</p>
            <PreviewArvore itens={estruturaSugerida} />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAplicarEstrutura}
                disabled={aplicandoEstrutura}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--accent)' }}
              >
                <Check size={13} /> {aplicandoEstrutura ? 'Aplicando…' : 'Aplicar estrutura'}
              </button>
              <button
                onClick={() => setEstruturaSugerida(null)}
                disabled={aplicandoEstrutura}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                <X size={13} /> Descartar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sugerir cronograma */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <CalendarRange size={16} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Sugerir datas do cronograma</h2>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          A IA sugere datas de início e fim para os itens da estrutura que ainda não têm datas, respeitando a hierarquia.
        </p>
        <button
          onClick={handleSugerirCronograma}
          disabled={gerandoCronograma || itens.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
          title={itens.length === 0 ? 'Crie a estrutura do projeto primeiro' : undefined}
        >
          {gerandoCronograma ? <Loader2 size={15} className="animate-spin" /> : <CalendarRange size={15} />}
          {gerandoCronograma ? 'Calculando…' : 'Sugerir com IA'}
        </button>
        {itens.length === 0 && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>Crie a estrutura do projeto primeiro.</p>
        )}

        {erroCronograma && (
          <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{erroCronograma}</p>
        )}

        {datasSugeridas && datasSugeridas.length > 0 && (
          <div className="mt-4 rounded-lg border p-3 overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Revise as datas antes de aplicar:</p>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left font-medium pb-1.5">Item</th>
                  <th className="text-left font-medium pb-1.5">Início</th>
                  <th className="text-left font-medium pb-1.5">Fim</th>
                </tr>
              </thead>
              <tbody>
                {datasSugeridas.map(d => (
                  <tr key={d.id}>
                    <td className="py-1 pr-3 truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>{d.nome}</td>
                    <td className="py-1 pr-2">
                      <input
                        type="date"
                        value={d.data_inicio}
                        onChange={e => atualizarDataSugerida(d.id, 'data_inicio', e.target.value)}
                        className="px-2 py-1 rounded border text-xs outline-none"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                    </td>
                    <td className="py-1">
                      <input
                        type="date"
                        value={d.data_prazo}
                        onChange={e => atualizarDataSugerida(d.id, 'data_prazo', e.target.value)}
                        className="px-2 py-1 rounded border text-xs outline-none"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAplicarCronograma}
                disabled={aplicandoCronograma}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: 'var(--accent)' }}
              >
                <Check size={13} /> {aplicandoCronograma ? 'Aplicando…' : 'Aplicar datas'}
              </button>
              <button
                onClick={() => setDatasSugeridas(null)}
                disabled={aplicandoCronograma}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                <X size={13} /> Descartar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat livre */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Conversar sobre o projeto</h2>
        <div className="h-64 overflow-y-auto rounded-lg p-3 flex flex-col gap-2 mb-3" style={{ background: 'var(--bg-secondary)' }}>
          {messages.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Pergunte algo sobre este projeto — progresso, próximos itens, sugestões de organização, etc.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-sm leading-relaxed rounded-xl p-2.5 max-w-[88%] whitespace-pre-line ${m.role === 'user' ? 'self-end' : 'self-start'}`}
              style={m.role === 'user'
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            >
              {m.content}
            </div>
          ))}
          {enviando && (
            <div className="self-start rounded-xl p-2.5" style={{ background: 'var(--bg-card)' }}>
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEnviarMensagem()}
            placeholder="Pergunte sobre este projeto..."
            className="flex-1 px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            disabled={enviando}
          />
          <button
            onClick={handleEnviarMensagem}
            disabled={!input.trim() || enviando}
            className="w-10 h-10 rounded-lg flex items-center justify-center disabled:opacity-50 flex-shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}
