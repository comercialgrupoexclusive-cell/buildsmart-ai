'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input, Select } from '@/components/ui/Input'
import { ComboboxCriavel } from '@/components/ui/ComboboxCriavel'

// Campos específicos do imóvel de aquisição. O ENDEREÇO NÃO mora aqui: ele é
// único no Processo (seção 3 canônica, Dados do processo com CEP). Aqui ficam a
// aquisição (forma, data, link) e as características do imóvel que alimentam uma
// busca de mercado eficiente. Quem guarda é `prospeccoes` (a oportunidade
// vinculada ao Processo).

export type DadosImovel = {
  link_leilao: string
  data_leilao: string
  tipo_aquisicao: 'leilao' | 'compra_direta'
  // Características (strings no form; convertidas ao salvar)
  tipo_imovel: string
  dormitorios: string
  suites: string
  banheiros: string
  vagas_garagem: string
  area_util: string
  area_total: string
  andar: string
  valor_condominio: string
  valor_iptu: string
}

export const IMOVEL_VAZIO: DadosImovel = {
  link_leilao: '',
  data_leilao: '',
  tipo_aquisicao: 'leilao',
  tipo_imovel: '',
  dormitorios: '',
  suites: '',
  banheiros: '',
  vagas_garagem: '',
  area_util: '',
  area_total: '',
  andar: '',
  valor_condominio: '',
  valor_iptu: '',
}

// Conversores form(string) → banco(number|null), reusados no bloco e no cadastro.
export function intOuNull(s: string): number | null {
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}
export function numOuNull(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function ImovelCampos({ valor, onChange, desabilitado }: {
  valor: DadosImovel
  onChange: (v: DadosImovel) => void
  desabilitado?: boolean
}) {
  const set = (patch: Partial<DadosImovel>) => onChange({ ...valor, ...patch })

  // Tipo de imóvel é cadastro no ponto de uso: sugere o que já foi usado na org
  // (RLS isola) e cria ao digitar. Sem lista fixa.
  const [tiposSug, setTiposSug] = useState<string[]>([])
  useEffect(() => {
    const supabase = createClient()
    supabase.from('prospeccoes').select('tipo_imovel').not('tipo_imovel', 'is', null)
      .then(({ data }: { data: { tipo_imovel: string | null }[] | null }) => {
        const nomes = (data ?? []).map(r => (r.tipo_imovel ?? '').trim()).filter(Boolean)
        setTiposSug(Array.from(new Set(nomes)))
      })
  }, [])

  return (
    <div className="space-y-5">
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

      <div className="space-y-4">
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Características do imóvel</p>

        <ComboboxCriavel
          label="Tipo de imóvel"
          placeholder="Buscar ou criar tipo (ex.: Apartamento)…"
          disabled={desabilitado}
          opcoes={tiposSug.map(t => ({ id: t, label: t }))}
          valorLabel={valor.tipo_imovel}
          onEscolher={o => set({ tipo_imovel: o.label })}
          onCriar={t => set({ tipo_imovel: t })}
          onLimpar={() => set({ tipo_imovel: '' })}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="Dormitórios" type="number" inputMode="numeric" min={0} value={valor.dormitorios} onChange={e => set({ dormitorios: e.target.value })} disabled={desabilitado} />
          <Input label="Suítes" type="number" inputMode="numeric" min={0} value={valor.suites} onChange={e => set({ suites: e.target.value })} disabled={desabilitado} />
          <Input label="Banheiros" type="number" inputMode="numeric" min={0} value={valor.banheiros} onChange={e => set({ banheiros: e.target.value })} disabled={desabilitado} />
          <Input label="Vagas garagem" type="number" inputMode="numeric" min={0} value={valor.vagas_garagem} onChange={e => set({ vagas_garagem: e.target.value })} disabled={desabilitado} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Input label="Área útil (m²)" type="number" inputMode="decimal" min={0} value={valor.area_util} onChange={e => set({ area_util: e.target.value })} disabled={desabilitado} />
          <Input label="Área total (m²)" type="number" inputMode="decimal" min={0} value={valor.area_total} onChange={e => set({ area_total: e.target.value })} disabled={desabilitado} />
          <Input label="Andar" type="number" inputMode="numeric" value={valor.andar} onChange={e => set({ andar: e.target.value })} disabled={desabilitado} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Condomínio (R$)" type="number" inputMode="decimal" min={0} value={valor.valor_condominio} onChange={e => set({ valor_condominio: e.target.value })} disabled={desabilitado} />
          <Input label="IPTU (R$/ano)" type="number" inputMode="decimal" min={0} value={valor.valor_iptu} onChange={e => set({ valor_iptu: e.target.value })} disabled={desabilitado} />
        </div>
      </div>
    </div>
  )
}
