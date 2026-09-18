'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { alterarStatusProcesso, atualizarDadosProcesso, type Processo, type ProcessoStatus } from '@/lib/processo'
import { listarMembrosDaOrganizacaoAtiva, type MembroOrganizacao } from '@/lib/organizacao/membros'

// Visão geral do Processo — identidade e estado, editáveis diretamente na
// célula. Mesma interação de EditableCell (app/(app)/servicos/page.tsx):
// clique vira input, Enter/perda de foco salva, Escape cancela. Nenhuma tela
// de edição separada, nenhum motor novo — as duas únicas escritas possíveis
// (dados gerais e status) já existem em lib/processo/service e são as mesmas
// que /processos/[id] usa.
//
// Responsável agora tem fonte segura: lib/organizacao/membros.ts, que lê a
// RPC organization_members_list (só a organização ativa, nunca profiles
// inteiro). Salva por profile_id, nunca por nome em texto.

const STATUS_OPCOES: { value: ProcessoStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'ON_HOLD', label: 'Em espera' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'ARCHIVED', label: 'Arquivado' },
]
const dataCurta = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

// Célula de texto: clique para editar, Enter ou perda de foco salva.
function CelulaTexto({ rotulo, valor, placeholder, salvar }: {
  rotulo: string
  valor: string
  placeholder?: string
  salvar: (novo: string) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(valor)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (editando) return
    // Mesmo idioma de EditableCell (app/(app)/servicos/page.tsx): adia pro
    // próximo microtask pra não fazer setState síncrono dentro do efeito.
    Promise.resolve().then(() => setRascunho(valor))
  }, [valor, editando])

  async function confirmar() {
    const novo = rascunho.trim()
    setEditando(false)
    if (novo === valor.trim()) return
    setSalvando(true)
    try {
      await salvar(novo)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/50">{rotulo}</div>
      {editando ? (
        <input
          autoFocus
          value={rascunho}
          onChange={e => setRascunho(e.target.value)}
          onBlur={confirmar}
          onKeyDown={e => {
            if (e.key === 'Enter') confirmar()
            if (e.key === 'Escape') { setRascunho(valor); setEditando(false) }
          }}
          className="mt-1 w-full rounded-lg border border-cyan-200/30 bg-black/30 px-2 py-1 text-[14px] text-white/92 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          disabled={salvando}
          title="Clique para editar"
          className="mt-1 block w-full cursor-text truncate rounded-lg px-2 py-1 text-left text-[14px] text-white/88 outline-none transition hover:bg-white/[0.05] disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : valor || <span className="text-white/35">{placeholder || '—'}</span>}
        </button>
      )}
    </div>
  )
}

// Célula de status: mesmo visual das demais, mas o valor é um <select> —
// não faz sentido digitar status livre quando o vocabulário é fechado.
function CelulaStatus({ status, salvar }: { status: ProcessoStatus; salvar: (novo: ProcessoStatus) => Promise<void> }) {
  const [salvando, setSalvando] = useState(false)
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/50">Situação</div>
      <select
        value={status}
        disabled={salvando}
        onChange={async e => {
          setSalvando(true)
          try { await salvar(e.target.value as ProcessoStatus) } finally { setSalvando(false) }
        }}
        className="mt-1 w-full rounded-lg bg-transparent px-2 py-1 text-[14px] text-white/88 outline-none transition hover:bg-white/[0.05] disabled:opacity-60"
      >
        {STATUS_OPCOES.map(o => (
          <option key={o.value} value={o.value} className="bg-slate-900 text-white">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Célula de responsável: mesmo visual de CelulaStatus, mas as opções vêm da
// organização ativa (lib/organizacao/membros.ts), nunca de `profiles`
// direto. O valor salvo é sempre profile_id — a UI só mostra o nome.
function CelulaResponsavel({ responsavelId, membros, carregando, salvar }: {
  responsavelId: string | null
  membros: MembroOrganizacao[]
  carregando: boolean
  salvar: (novo: string | null) => Promise<void>
}) {
  const [salvando, setSalvando] = useState(false)

  const atual = membros.find(m => m.profile_id === responsavelId)
  // Selecionável: qualquer membro ativo, mais o atual mesmo que tenha ficado
  // inativo — pra não trocar o responsável sozinho só porque alguém saiu.
  const opcoes = membros.filter(m => m.ativo || m.profile_id === responsavelId)
  // O responsável pode apontar pra alguém que nem aparece mais na
  // organização (removido de vez, não só inativo) — a RPC só lista quem
  // está lá hoje. Mostra isso de forma honesta em vez de trocar sozinho.
  const removido = !!responsavelId && !atual

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/50">Responsável</div>
      {carregando ? (
        <div className="mt-1 px-2 py-1 text-[14px] text-white/40">Carregando…</div>
      ) : (
        <select
          value={responsavelId ?? ''}
          disabled={salvando}
          onChange={async e => {
            setSalvando(true)
            try { await salvar(e.target.value || null) } finally { setSalvando(false) }
          }}
          className="mt-1 w-full rounded-lg bg-transparent px-2 py-1 text-[14px] text-white/88 outline-none transition hover:bg-white/[0.05] disabled:opacity-60"
        >
          <option value="" className="bg-slate-900 text-white">Sem responsável</option>
          {removido && (
            <option value={responsavelId ?? ''} className="bg-slate-900 text-white/50">
              Fora da organização
            </option>
          )}
          {opcoes.map(m => (
            <option key={m.profile_id} value={m.profile_id} className="bg-slate-900 text-white">
              {m.nome}{!m.ativo ? ' (inativo)' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function CelulaFixa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/50">{rotulo}</div>
      <div className="mt-1 px-2 py-1 text-[14px] text-white/60">{valor}</div>
    </div>
  )
}

// Título grande, mas com a mesma interação de célula — clique edita, Enter
// ou perda de foco salva. Mantém a hierarquia visual anterior (nome em
// destaque) sem virar mais um campo pequeno da grade.
function TituloEditavel({ valor, salvar }: { valor: string; salvar: (novo: string) => Promise<void> }) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(valor)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (editando) return
    Promise.resolve().then(() => setRascunho(valor))
  }, [valor, editando])

  async function confirmar() {
    const novo = rascunho.trim()
    setEditando(false)
    if (!novo || novo === valor.trim()) { setRascunho(valor); return }
    setSalvando(true)
    try { await salvar(novo) } finally { setSalvando(false) }
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={rascunho}
        onChange={e => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') confirmar()
          if (e.key === 'Escape') { setRascunho(valor); setEditando(false) }
        }}
        className="w-full rounded-lg border border-cyan-200/30 bg-black/30 px-2 py-0.5 text-[19px] font-semibold text-white/92 outline-none"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      disabled={salvando}
      title="Clique para editar"
      className="-mx-2 block rounded-lg px-2 py-0.5 text-left text-[19px] font-semibold text-white/92 outline-none transition hover:bg-white/[0.05] disabled:opacity-60"
    >
      {salvando ? 'Salvando…' : valor}
    </button>
  )
}

export function TelaVisaoGeral({ processo, modulos, onAtualizado }: {
  processo: Processo
  modulos: string[]
  onAtualizado: (p: Processo) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [erro, setErro] = useState('')
  const [membros, setMembros] = useState<MembroOrganizacao[]>([])
  const [carregandoMembros, setCarregandoMembros] = useState(true)

  useEffect(() => {
    let vivo = true
    void listarMembrosDaOrganizacaoAtiva(supabase)
      .then(lista => { if (vivo) setMembros(lista) })
      .catch(() => { if (vivo) setMembros([]) })
      .finally(() => { if (vivo) setCarregandoMembros(false) })
    return () => { vivo = false }
  }, [supabase])

  async function salvarCampo(patch: Parameters<typeof atualizarDadosProcesso>[2]) {
    setErro('')
    try {
      const atualizado = await atualizarDadosProcesso(supabase, processo.id, patch)
      onAtualizado(atualizado)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  async function salvarStatus(status: ProcessoStatus) {
    setErro('')
    try {
      const atualizado = await alterarStatusProcesso(supabase, processo.id, status)
      onAtualizado(atualizado)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o status.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TituloEditavel valor={processo.nome} salvar={nome => salvarCampo({ nome })} />

      {erro && <p className="text-[12.5px] text-red-300/85">{erro}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CelulaTexto rotulo="Tipo" valor={processo.tipo ?? ''} placeholder="Ex.: Obra, Reforma…" salvar={tipo => salvarCampo({ tipo })} />
        <CelulaTexto rotulo="Cliente" valor={processo.cliente_nome ?? ''} placeholder="Sem cliente" salvar={cliente_nome => salvarCampo({ cliente_nome })} />
        <CelulaTexto rotulo="Endereço" valor={processo.endereco ?? ''} placeholder="Sem endereço" salvar={endereco => salvarCampo({ endereco })} />
        <CelulaStatus status={processo.status} salvar={salvarStatus} />
        <CelulaResponsavel
          responsavelId={processo.responsavel_id}
          membros={membros}
          carregando={carregandoMembros}
          salvar={responsavel_id => salvarCampo({ responsavel_id })}
        />
        <CelulaFixa rotulo="Aberto em" valor={dataCurta(processo.created_at)} />
        <CelulaFixa rotulo="Última atualização" valor={dataCurta(processo.updated_at)} />
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
        <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/55">Módulos habilitados</div>
        {modulos.length === 0 ? (
          <p className="mt-2 text-[13px] text-white/50">
            Nenhum módulo habilitado ainda. Habilite em Config.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {modulos.map(m => (
              <span key={m} className="rounded-full border border-cyan-200/18 bg-cyan-300/10 px-2.5 py-1 text-[12px] text-cyan-100/80">
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
