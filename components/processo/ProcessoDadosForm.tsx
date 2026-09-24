'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { campoOculto, type AtualizarProcessoInput, type Processo, type ProcessoStatus } from '@/lib/processo'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

// Formulário de cadastro do Processo. Um só, usado pelo "Editar" do card e
// pela aba Visão Geral — os dois editam exatamente os mesmos campos, então
// não existem duas versões para divergirem depois.

const STATUS_OPCOES: { value: ProcessoStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'ON_HOLD', label: 'Em espera' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'ARCHIVED', label: 'Arquivado' },
]

export type DadosProcesso = AtualizarProcessoInput & { status?: ProcessoStatus }

export function ProcessoDadosForm({ processo, onSalvar, onCancelar, mostrarStatus = true }: {
  processo: Processo
  onSalvar: (dados: DadosProcesso) => Promise<void>
  onCancelar?: () => void
  mostrarStatus?: boolean
}) {
  const inputCapaRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(processo.nome)
  const [tipo, setTipo] = useState(processo.tipo ?? '')
  const [clienteNome, setClienteNome] = useState(processo.cliente_nome ?? '')
  const [endereco, setEndereco] = useState(processo.endereco ?? '')
  const [status, setStatus] = useState<ProcessoStatus>(processo.status)
  const [capaUrl, setCapaUrl] = useState(processo.capa_url)
  const [enviandoCapa, setEnviandoCapa] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const ocultarCliente = campoOculto(processo.template_key, 'cliente_nome')

  // Mesmo bucket e mesmo padrão de prefixo da Caixa de Entrada — nenhum
  // bucket novo para a capa.
  async function enviarCapa(arquivo: File | undefined) {
    if (!arquivo) return
    setErro('')
    setEnviandoCapa(true)
    try {
      const supabase = createClient()
      const ext = arquivo.name.split('.').pop() || 'jpg'
      const path = `processo-capa/${processo.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('project-files').upload(path, arquivo)
      if (error) throw error
      setCapaUrl(supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl)
    } catch {
      setErro('Não foi possível enviar a imagem.')
    } finally {
      setEnviandoCapa(false)
      if (inputCapaRef.current) inputCapaRef.current.value = ''
    }
  }

  async function salvar() {
    if (!nome.trim()) {
      setErro('O nome é obrigatório.')
      return
    }
    setErro('')
    setSalvando(true)
    try {
      await onSalvar({
        nome: nome.trim(),
        tipo: tipo.trim() || null,
        // Template que esconde o campo nunca grava valor nele — senão um
        // cliente digitado antes da troca de template ficaria preso invisível.
        cliente_nome: ocultarCliente ? null : (clienteNome.trim() || null),
        endereco: endereco.trim() || null,
        capa_url: capaUrl,
        ...(mostrarStatus ? { status } : {}),
      })
    } catch {
      setErro('Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Foto de fundo</label>
        <div className="mt-1.5 flex items-center gap-3">
          <div
            className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
          >
            {capaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={capaUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center" style={{ color: 'var(--text-secondary)' }}>
                <ImagePlus size={18} />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={enviandoCapa}
              onClick={() => inputCapaRef.current?.click()}
            >
              {capaUrl ? 'Trocar' : 'Escolher imagem'}
            </Button>
            {capaUrl && (
              <button
                type="button"
                onClick={() => setCapaUrl(null)}
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Trash2 size={12} /> Remover
              </button>
            )}
          </div>
          <input
            ref={inputCapaRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => void enviarCapa(e.target.files?.[0])}
          />
        </div>
      </div>

      <Input label="Nome" value={nome} onChange={e => setNome(e.target.value)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Tipo" value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Residencial, Reforma…" />
        {!ocultarCliente && (
          <Input label="Cliente" value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
        )}
      </div>

      <Input label="Endereço" value={endereco} onChange={e => setEndereco(e.target.value)} />

      {mostrarStatus && (
        <Select label="Status" value={status} onChange={e => setStatus(e.target.value as ProcessoStatus)}>
          {STATUS_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )}

      {erro && <p className="text-xs" style={{ color: '#f87171' }}>{erro}</p>}

      <div className="flex justify-end gap-2">
        {onCancelar && <Button variant="ghost" onClick={onCancelar} disabled={salvando}>Cancelar</Button>}
        <Button onClick={() => void salvar()} loading={salvando}>Salvar</Button>
      </div>
    </div>
  )
}
