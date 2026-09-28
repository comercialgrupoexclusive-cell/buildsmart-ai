'use client'

// Seção 3 canônica: endereço estruturado com busca por CEP. Um componente só,
// usado no cadastro (Novo Processo) e na edição (ProcessoDadosForm) — não pode
// existir mais de um lugar para o endereço em Processos.

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Input, Select } from '@/components/ui/Input'

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

export type EnderecoValor = {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const ENDERECO_VAZIO: EnderecoValor = {
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
}

// Endereço vindo de um Processo persistido (colunas estruturadas).
export function enderecoDe(p: {
  cep?: string | null; logradouro?: string | null; numero?: string | null
  complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null
}): EnderecoValor {
  return {
    cep: p.cep ?? '', logradouro: p.logradouro ?? '', numero: p.numero ?? '',
    complemento: p.complemento ?? '', bairro: p.bairro ?? '', cidade: p.cidade ?? '', uf: p.uf ?? '',
  }
}

// Texto legado (coluna `endereco`) — mantido para cards/buscas/mapa antigos.
export function enderecoResumo(v: EnderecoValor): string {
  return [v.logradouro.trim(), v.numero.trim(), v.bairro.trim(), v.cidade.trim(), v.uf].filter(Boolean).join(', ')
}

export function EnderecoFields({ valor, onChange, disabled }: {
  valor: EnderecoValor
  onChange: (v: EnderecoValor) => void
  disabled?: boolean
}) {
  const [buscandoCep, setBuscandoCep] = useState(false)
  const set = (patch: Partial<EnderecoValor>) => onChange({ ...valor, ...patch })

  async function buscarCep(entrada: string) {
    const limpo = entrada.replace(/\D/g, '')
    if (limpo.length !== 8) { set({ cep: entrada }); return }
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
      if (!res.ok) { set({ cep: entrada }); return }
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
      if (data.erro) { set({ cep: entrada }); return }
      onChange({
        ...valor,
        cep: entrada,
        logradouro: data.logradouro || valor.logradouro,
        bairro: data.bairro || valor.bairro,
        cidade: data.localidade || valor.cidade,
        uf: data.uf || valor.uf,
      })
    } catch {
      set({ cep: entrada }) // rede falhou — segue manual
    } finally {
      setBuscandoCep(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Endereço</p>

      <div className="flex items-end gap-2">
        <div className="max-w-[180px]">
          <Input label="CEP" value={valor.cep} onChange={e => void buscarCep(e.target.value)} placeholder="00000-000" maxLength={9} disabled={disabled} />
        </div>
        {buscandoCep && <Loader2 size={16} className="animate-spin mb-3 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />}
      </div>

      <Input label="Logradouro" value={valor.logradouro} onChange={e => set({ logradouro: e.target.value })} placeholder="Rua, Av., Alameda…" disabled={disabled} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Número" value={valor.numero} onChange={e => set({ numero: e.target.value })} placeholder="123" disabled={disabled} />
        <Input label="Complemento" value={valor.complemento} onChange={e => set({ complemento: e.target.value })} placeholder="Apto, Bloco…" disabled={disabled} />
      </div>

      <Input label="Bairro" value={valor.bairro} onChange={e => set({ bairro: e.target.value })} disabled={disabled} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Cidade" value={valor.cidade} onChange={e => set({ cidade: e.target.value })} disabled={disabled} />
        <Select label="UF" value={valor.uf} onChange={e => set({ uf: e.target.value })} disabled={disabled}>
          <option value="">—</option>
          {UFS.map(u => <option key={u} value={u}>{u}</option>)}
        </Select>
      </div>
    </div>
  )
}
