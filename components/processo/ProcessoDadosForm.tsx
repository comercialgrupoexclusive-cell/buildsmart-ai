'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { campoOcultoPor, type AtualizarProcessoInput, type Processo, type ProcessoStatus, type ProcessoTemplate } from '@/lib/processo'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

const STATUS_OPCOES: { value: ProcessoStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'ON_HOLD', label: 'Em espera' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'ARCHIVED', label: 'Arquivado' },
]

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

export type DadosProcesso = AtualizarProcessoInput & { status?: ProcessoStatus }

export function ProcessoDadosForm({ processo, template, onSalvar, onCancelar, mostrarStatus = true }: {
  processo: Processo
  template?: ProcessoTemplate | null
  onSalvar: (dados: DadosProcesso) => Promise<void>
  onCancelar?: () => void
  mostrarStatus?: boolean
}) {
  const inputCapaRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(processo.nome)
  const [tipo, setTipo] = useState(processo.tipo ?? '')
  const [clienteNome, setClienteNome] = useState(processo.cliente_nome ?? '')
  const [status, setStatus] = useState<ProcessoStatus>(processo.status)
  const [capaUrl, setCapaUrl] = useState(processo.capa_url)
  const [enviandoCapa, setEnviandoCapa] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Endereço estruturado
  const [cep, setCep] = useState(processo.cep ?? '')
  const [logradouro, setLogradouro] = useState(processo.logradouro ?? '')
  const [numero, setNumero] = useState(processo.numero ?? '')
  const [complemento, setComplemento] = useState(processo.complemento ?? '')
  const [bairro, setBairro] = useState(processo.bairro ?? '')
  const [cidade, setCidade] = useState(processo.cidade ?? '')
  const [uf, setUf] = useState(processo.uf ?? '')
  const [buscandoCep, setBuscandoCep] = useState(false)

  const oculto = (campo: Parameters<typeof campoOcultoPor>[1]) => campoOcultoPor(template, campo)
  const ocultarCliente = oculto('cliente_nome')

  async function buscarCep(valor: string) {
    const limpo = valor.replace(/\D/g, '')
    setCep(valor)
    if (limpo.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
      if (!res.ok) return
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (data.erro) return
      setLogradouro(data.logradouro ?? '')
      setBairro(data.bairro ?? '')
      setCidade(data.localidade ?? '')
      setUf(data.uf ?? '')
    } catch {
      // ignora erro de rede — usuário preenche manualmente
    } finally {
      setBuscandoCep(false)
    }
  }

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
        tipo: oculto('tipo') ? null : (tipo.trim() || null),
        cliente_nome: ocultarCliente ? null : (clienteNome.trim() || null),
        cep: cep.replace(/\D/g, '').padEnd(0) || null,
        logradouro: logradouro.trim() || null,
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf || null,
        // legado — mantido para retrocompatibilidade com cards/buscas antigas
        endereco: [logradouro.trim(), numero.trim(), bairro.trim(), cidade.trim(), uf].filter(Boolean).join(', ') || null,
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
        {!oculto('tipo') && (
          <Input label="Tipo" value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Residencial, Reforma…" />
        )}
        {!ocultarCliente && (
          <Input label="Cliente" value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
        )}
      </div>

      {!oculto('endereco') && (
        <div className="space-y-3">
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Endereço</p>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-[180px]">
              <Input
                label="CEP"
                value={cep}
                onChange={e => void buscarCep(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
              />
            </div>
            {buscandoCep && (
              <Loader2 size={16} className="animate-spin mt-5 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
            )}
          </div>

          <Input label="Logradouro" value={logradouro} onChange={e => setLogradouro(e.target.value)} placeholder="Rua, Av., Alameda…" />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Número" value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" />
            <Input label="Complemento" value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Apto, Bloco…" />
          </div>

          <Input label="Bairro" value={bairro} onChange={e => setBairro(e.target.value)} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} />
            <Select label="UF" value={uf} onChange={e => setUf(e.target.value)}>
              <option value="">—</option>
              {UFS.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
        </div>
      )}

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
