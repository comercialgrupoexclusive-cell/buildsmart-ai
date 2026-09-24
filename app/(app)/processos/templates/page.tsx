'use client'

// Templates de Processo. Um template responde duas perguntas: quais módulos
// o Processo já nasce com, e quais campos do cadastro não se aplicam àquele
// tipo de trabalho. Nada além disso — não é workflow nem motor novo.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  CAMPOS_OCULTAVEIS,
  atualizarTemplate,
  criarTemplate,
  excluirTemplate,
  listarModulosDisponiveis,
  listarTemplates,
  type CampoOcultavel,
  type ProcessoTemplate,
} from '@/lib/processo'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'

type Rascunho = {
  nome: string
  descricao: string
  modulos: string[]
  campos_ocultos: CampoOcultavel[]
}

const VAZIO: Rascunho = { nome: '', descricao: '', modulos: [], campos_ocultos: [] }

export default function TemplatesPage() {
  const supabase = useMemo(() => createClient(), [])
  const registry = listarModulosDisponiveis()

  const [templates, setTemplates] = useState<ProcessoTemplate[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<ProcessoTemplate | null>(null)
  const [criando, setCriando] = useState(false)
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO)
  const [excluindo, setExcluindo] = useState<ProcessoTemplate | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try {
      setTemplates(await listarTemplates(supabase))
    } catch {
      setErro('Não foi possível carregar os templates.')
    } finally {
      setCarregando(false)
    }
  }, [supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  function abrirNovo() {
    setRascunho(VAZIO)
    setCriando(true)
  }

  function abrirEdicao(t: ProcessoTemplate) {
    setRascunho({
      nome: t.nome,
      descricao: t.descricao ?? '',
      modulos: [...t.modulos],
      campos_ocultos: [...t.campos_ocultos],
    })
    setEditando(t)
  }

  function fechar() {
    setCriando(false)
    setEditando(null)
    setRascunho(VAZIO)
    setErro('')
  }

  function alternarModulo(key: string) {
    setRascunho(r => ({
      ...r,
      modulos: r.modulos.includes(key) ? r.modulos.filter(m => m !== key) : [...r.modulos, key],
    }))
  }

  function alternarCampo(campo: CampoOcultavel) {
    setRascunho(r => ({
      ...r,
      campos_ocultos: r.campos_ocultos.includes(campo)
        ? r.campos_ocultos.filter(c => c !== campo)
        : [...r.campos_ocultos, campo],
    }))
  }

  async function salvar() {
    if (!rascunho.nome.trim()) {
      setErro('O template precisa de um nome.')
      return
    }
    setErro('')
    setSalvando(true)
    try {
      if (editando) {
        await atualizarTemplate(supabase, editando.id, rascunho)
      } else {
        await criarTemplate(supabase, rascunho, null)
      }
      fechar()
      await carregar()
    } catch {
      setErro('Não foi possível salvar. Já existe um template com esse nome?')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo || salvando) return
    setSalvando(true)
    try {
      await excluirTemplate(supabase, excluindo.id)
      setExcluindo(null)
      await carregar()
    } finally {
      setSalvando(false)
    }
  }

  const aberto = criando || !!editando

  return (
    <div className="space-y-6">
      <Link href="/processos" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} />
        Voltar para Processos
      </Link>

      <PageHeader
        title="Templates"
        subtitle="Cada template decide com quais módulos o Processo nasce e quais campos não se aplicam."
        titleAction={<Button size="sm" icon={<Plus size={15} />} onClick={abrirNovo}>Novo template</Button>}
      />

      {erro && !aberto && <p className="text-xs px-1" style={{ color: '#f87171' }}>{erro}</p>}

      {carregando ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Nenhum template ainda"
          description="Crie um para não configurar os mesmos módulos a cada Processo novo."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.nome}</h3>
                  {t.descricao && (
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{t.descricao}</p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(t)}
                    aria-label={`Editar ${t.nome}`}
                    className="p-1.5 rounded-lg"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcluindo(t)}
                    aria-label={`Excluir ${t.nome}`}
                    className="p-1.5 rounded-lg"
                    style={{ color: '#f87171' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.modulos.length === 0 ? (
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem módulos definidos</span>
                ) : (
                  t.modulos.map(key => (
                    <span
                      key={key}
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    >
                      {registry.find(m => m.key === key)?.label ?? key}
                    </span>
                  ))
                )}
              </div>

              {t.campos_ocultos.length > 0 && (
                <p className="mt-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Oculta: {t.campos_ocultos.map(c => CAMPOS_OCULTAVEIS.find(x => x.campo === c)?.label ?? c).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={aberto} onClose={fechar} title={editando ? 'Editar template' : 'Novo template'} size="lg">
        <div className="space-y-5">
          <Input
            label="Nome"
            value={rascunho.nome}
            onChange={e => setRascunho(r => ({ ...r, nome: e.target.value }))}
            placeholder="Ex: Leilão, Obra para cliente…"
          />
          <Textarea
            label="Descrição"
            rows={2}
            value={rascunho.descricao}
            onChange={e => setRascunho(r => ({ ...r, descricao: e.target.value }))}
            placeholder="Uma linha explicando quando usar este template."
          />

          <div>
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Módulos que já nascem habilitados
            </label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {registry.map(mod => {
                const ativo = rascunho.modulos.includes(mod.key)
                return (
                  <button
                    key={mod.key}
                    type="button"
                    onClick={() => alternarModulo(mod.key)}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm"
                    style={{
                      background: 'var(--bg-secondary)',
                      border: `1px solid ${ativo ? 'var(--accent)' : 'var(--border)'}`,
                      color: ativo ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {mod.label}
                    {ativo && <span className="text-xs" style={{ color: 'var(--accent)' }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Campos que não se aplicam
            </label>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Somem do cadastro e da Visão Geral. Num leilão, por exemplo, não existe cliente contratante.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CAMPOS_OCULTAVEIS.map(({ campo, label }) => {
                const oculto = rascunho.campos_ocultos.includes(campo)
                return (
                  <button
                    key={campo}
                    type="button"
                    onClick={() => alternarCampo(campo)}
                    className="rounded-full px-3 py-1 text-xs"
                    style={{
                      background: oculto ? 'rgba(245,158,11,0.15)' : 'var(--bg-secondary)',
                      border: `1px solid ${oculto ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                      color: oculto ? '#f59e0b' : 'var(--text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {erro && <p className="text-xs" style={{ color: '#f87171' }}>{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={fechar} disabled={salvando}>Cancelar</Button>
            <Button onClick={() => void salvar()} loading={salvando}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!excluindo} onClose={() => setExcluindo(null)} title="Excluir template" size="sm">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Excluir <strong style={{ color: 'var(--text-primary)' }}>{excluindo?.nome}</strong> não apaga nenhum
          Processo. Os que nasceram dele passam a mostrar todos os campos.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setExcluindo(null)} disabled={salvando}>Cancelar</Button>
          <Button variant="danger" onClick={() => void confirmarExclusao()} loading={salvando}>Excluir</Button>
        </div>
      </Modal>
    </div>
  )
}
