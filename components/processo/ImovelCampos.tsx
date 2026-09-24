'use client'

import { Input, Select } from '@/components/ui/Input'

// Campos do imóvel de um Processo de aquisição. São os mesmos no "Novo
// Processo" e na Visão Geral — um componente só, para os dois não
// divergirem. Quem guarda é `prospeccoes` (a oportunidade vinculada ao
// Processo), não a tabela `processos`: imóvel é objeto do Investidor, e
// duplicar esses campos em processos criaria duas verdades.

export type DadosImovel = {
  endereco: string
  link_leilao: string
  data_leilao: string
  tipo_aquisicao: 'leilao' | 'compra_direta'
}

export const IMOVEL_VAZIO: DadosImovel = {
  endereco: '',
  link_leilao: '',
  data_leilao: '',
  tipo_aquisicao: 'leilao',
}

export function ImovelCampos({ valor, onChange, desabilitado }: {
  valor: DadosImovel
  onChange: (v: DadosImovel) => void
  desabilitado?: boolean
}) {
  const set = (patch: Partial<DadosImovel>) => onChange({ ...valor, ...patch })

  return (
    <div className="space-y-4">
      <Input
        label="Endereço do imóvel"
        value={valor.endereco}
        onChange={e => set({ endereco: e.target.value })}
        placeholder="Rua, número, bairro, cidade"
        disabled={desabilitado}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Forma de aquisição"
          value={valor.tipo_aquisicao}
          onChange={e => set({ tipo_aquisicao: e.target.value as DadosImovel['tipo_aquisicao'] })}
          disabled={desabilitado}
        >
          <option value="leilao">Leilão</option>
          <option value="compra_direta">Compra direta</option>
        </Select>
        <Input
          label="Data do leilão"
          type="date"
          value={valor.data_leilao}
          onChange={e => set({ data_leilao: e.target.value })}
          disabled={desabilitado || valor.tipo_aquisicao !== 'leilao'}
        />
      </div>

      <Input
        label="Link do anúncio"
        value={valor.link_leilao}
        onChange={e => set({ link_leilao: e.target.value })}
        placeholder="https://…"
        hint="O print da tela do leilão, na aba Pesquisa de Mercado, preenche o resto sozinho."
        disabled={desabilitado}
      />
    </div>
  )
}
