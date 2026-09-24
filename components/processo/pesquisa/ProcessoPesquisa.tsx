'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, FileText, ImageUp, Link2, Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import {
  criarOportunidadeDoProcesso,
  obterOportunidadeDoProcesso,
} from '@/lib/investidor-oportunidade'
import type { Prospeccao } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabs, type TabOption } from '@/components/ui/Tabs'
import { RelatorioPesquisa } from './RelatorioPesquisa'
import { ComparaveisLista } from './ComparaveisLista'

// Pesquisa de mercado do Processo.
//
// A simplificação que este módulo faz: para o usuário existe UMA ação —
// jogar o print do leilão. Por baixo, os três passos que já existiam
// (extrair ficha → pesquisar comparáveis → analisar mercado) continuam
// sendo três chamadas, porque cada uma sozinha já chega perto do limite de
// 60s de uma função. A tela encadeia e mostra em que passo está, em vez de
// exigir que a pessoa aperte três botões em três abas diferentes.
//
// Nenhuma regra do Investidor é reescrita aqui: as três ações são as mesmas
// de /api/investidor/mercado que /investidor/[id] usa.

type Passo = 'ficha' | 'comparaveis' | 'analise'
type EstadoPasso = 'espera' | 'rodando' | 'ok' | 'falhou'

const PASSOS: { id: Passo; label: string }[] = [
  { id: 'ficha', label: 'Lendo o anúncio' },
  { id: 'comparaveis', label: 'Buscando comparáveis' },
  { id: 'analise', label: 'Montando o relatório' },
]

type SubAba = 'relatorio' | 'comparaveis'

export function ProcessoPesquisa({ processoId, processoNome }: { processoId: string; processoNome: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()

  const [oportunidade, setOportunidade] = useState<Prospeccao | null | undefined>(undefined)
  const [erro, setErro] = useState('')
  const [subAba, setSubAba] = useState<SubAba>('relatorio')
  const [recarregar, setRecarregar] = useState(0)

  const [enderecoNovo, setEnderecoNovo] = useState('')
  const [criando, setCriando] = useState(false)

  const [estados, setEstados] = useState<Record<Passo, EstadoPasso>>({
    ficha: 'espera', comparaveis: 'espera', analise: 'espera',
  })
  const [rodando, setRodando] = useState(false)
  const [linkAnuncio, setLinkAnuncio] = useState('')

  const carregar = useCallback(async () => {
    try {
      setOportunidade(await obterOportunidadeDoProcesso(supabase, processoId))
    } catch {
      setOportunidade(null)
      setErro('Não consegui carregar o imóvel deste Processo.')
    }
  }, [supabase, processoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  async function criarImovel() {
    if (criando) return
    setErro('')
    setCriando(true)
    try {
      const nova = await criarOportunidadeDoProcesso(supabase, processoId, processoNome, enderecoNovo.trim() || null)
      setOportunidade(nova)
    } catch {
      setErro('Não foi possível criar o imóvel deste Processo.')
    } finally {
      setCriando(false)
    }
  }

  async function chamar(action: string, extra: Record<string, unknown>) {
    const resposta = await fetch('/api/investidor/mercado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        prospeccaoId: oportunidade?.id,
        profileId: currentProfile?.id,
        actor: currentProfile?.name,
        ...extra,
      }),
    })
    if (!resposta.ok) throw new Error(`Falha em ${action}`)
    const dados = await resposta.json()
    if (dados.status === 'erro') throw new Error(dados.error || `Falha em ${action}`)
    return dados
  }

  // Cada passo é independente: se a busca de comparáveis falhar, a ficha já
  // extraída continua valendo. O relatório mostra o que deu certo em vez de
  // desfazer tudo.
  async function rodarPesquisa(fonte: { anexo?: unknown; fonteUrl?: string }) {
    if (!oportunidade || rodando) return
    setErro('')
    setRodando(true)
    setEstados({ ficha: 'rodando', comparaveis: 'espera', analise: 'espera' })

    let fichaOk = false
    try {
      await chamar('extrair_ficha', fonte)
      fichaOk = true
      setEstados(e => ({ ...e, ficha: 'ok', comparaveis: 'rodando' }))
    } catch {
      setEstados(e => ({ ...e, ficha: 'falhou' }))
      setErro('Não consegui ler o anúncio. Tente outro print ou o link do leilão.')
      setRodando(false)
      return
    }

    let comparaveisOk = false
    if (fichaOk) {
      try {
        const r = await chamar('pesquisar_comparaveis', { ampliarBusca: false })
        comparaveisOk = r.status === 'ok' && (r.totalComparaveis ?? 0) > 0
        setEstados(e => ({
          ...e,
          comparaveis: comparaveisOk ? 'ok' : 'falhou',
          analise: comparaveisOk ? 'rodando' : 'espera',
        }))
        if (!comparaveisOk) setErro('A ficha foi lida, mas nenhum comparável foi encontrado. Tente "Ampliar busca".')
      } catch {
        setEstados(e => ({ ...e, comparaveis: 'falhou' }))
        setErro('A ficha foi lida, mas a busca de comparáveis falhou.')
      }
    }

    if (comparaveisOk) {
      try {
        await chamar('analisar_mercado', {})
        setEstados(e => ({ ...e, analise: 'ok' }))
      } catch {
        setEstados(e => ({ ...e, analise: 'falhou' }))
        setErro('Comparáveis encontrados, mas o relatório não pôde ser montado.')
      }
    }

    setRodando(false)
    setRecarregar(n => n + 1)
  }

  async function enviarPrint(file: File | undefined) {
    if (!file) return
    setErro('')
    try {
      if (file.type === 'application/pdf') {
        const form = new FormData()
        form.append('file', file)
        const r = await fetch('/api/extract-pdf', { method: 'POST', body: form })
        const d = await r.json()
        if (!r.ok) throw new Error()
        await rodarPesquisa({ anexo: { tipo: 'pdf', nome: file.name, textoExtraido: d.texto } })
        return
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await rodarPesquisa({ anexo: { tipo: 'imagem', nome: file.name, dataUrl } })
    } catch {
      setErro('Não consegui ler esse arquivo.')
    }
  }

  if (oportunidade === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!oportunidade) {
    return (
      <div className="card p-5 max-w-md">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Imóvel deste Processo</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          A pesquisa de mercado precisa de um imóvel. O endereço pode ficar em branco — o print do leilão preenche
          depois.
        </p>
        <div className="mt-4 space-y-3">
          <Input
            label="Endereço"
            value={enderecoNovo}
            onChange={e => setEnderecoNovo(e.target.value)}
            placeholder="Rua, número, bairro, cidade"
          />
          {erro && <p className="text-xs" style={{ color: '#f87171' }}>{erro}</p>}
          <Button onClick={() => void criarImovel()} loading={criando}>Criar imóvel</Button>
        </div>
      </div>
    )
  }

  const subAbas: TabOption<SubAba>[] = [
    { key: 'relatorio', label: 'Relatório', icon: FileText },
    { key: 'comparaveis', label: 'Comparáveis', icon: Link2 },
  ]

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {oportunidade.endereco || oportunidade.nome}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Jogue o print da tela do leilão. A leitura, a busca e o relatório saem daí.
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                disabled={rodando}
                onChange={e => void enviarPrint(e.target.files?.[0])}
              />
              <span
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: 'var(--accent)', color: 'white', opacity: rodando ? 0.5 : 1 }}
              >
                {rodando ? <Loader2 size={15} className="animate-spin" /> : <ImageUp size={15} />}
                Enviar print
              </span>
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={rodando}
              icon={<RefreshCw size={14} />}
              onClick={() => void chamar('pesquisar_comparaveis', { ampliarBusca: true })
                .then(() => setRecarregar(n => n + 1))
                .catch(() => setErro('Não foi possível ampliar a busca.'))}
            >
              Ampliar busca
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <Input
            className="max-w-xs"
            value={linkAnuncio}
            onChange={e => setLinkAnuncio(e.target.value)}
            placeholder="…ou cole o link do leilão"
            disabled={rodando}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={rodando || !linkAnuncio.trim()}
            onClick={() => void rodarPesquisa({ fonteUrl: linkAnuncio.trim() })}
          >
            Usar link
          </Button>
        </div>

        {(rodando || Object.values(estados).some(e => e !== 'espera')) && (
          <div className="mt-3 flex flex-wrap gap-3">
            {PASSOS.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1.5 text-xs" style={{
                color: estados[p.id] === 'falhou' ? '#f87171'
                  : estados[p.id] === 'ok' ? '#10b981'
                  : 'var(--text-secondary)',
              }}>
                {estados[p.id] === 'rodando' && <Loader2 size={12} className="animate-spin" />}
                {estados[p.id] === 'ok' && <Check size={12} />}
                {estados[p.id] === 'falhou' && <AlertTriangle size={12} />}
                {p.label}
              </span>
            ))}
          </div>
        )}

        {erro && <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{erro}</p>}
      </div>

      <Tabs options={subAbas} value={subAba} onChange={setSubAba} />

      {subAba === 'relatorio'
        ? <RelatorioPesquisa prospeccaoId={oportunidade.id} prospeccao={oportunidade} recarregar={recarregar} />
        : <ComparaveisLista prospeccaoId={oportunidade.id} recarregar={recarregar} onMudou={() => setRecarregar(n => n + 1)} />}
    </div>
  )
}
