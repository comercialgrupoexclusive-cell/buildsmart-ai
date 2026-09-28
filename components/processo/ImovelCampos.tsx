'use client'

import { Input, Select } from '@/components/ui/Input'

// Campos específicos do imóvel de aquisição (leilão/compra). O ENDEREÇO NÃO
// mora aqui: ele é único no Processo (seção 3 canônica, Dados do processo com
// CEP). Estes campos são só o que é próprio da aquisição — forma, data do
// leilão e link do anúncio. Quem guarda é `prospeccoes` (a oportunidade
// vinculada ao Processo).

export type DadosImovel = {
  link_leilao: string
  data_leilao: string
  tipo_aquisicao: 'leilao' | 'compra_direta'
}

export const IMOVEL_VAZIO: DadosImovel = {
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
