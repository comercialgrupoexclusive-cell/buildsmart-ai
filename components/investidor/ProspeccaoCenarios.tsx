'use client'

// Aba "Análise" da Prospecção (Laboratório Investidor, Rodada 3 — Marco 3).
// CRUD completo de Cenários financeiros (múltiplos cenários, duplicar,
// excluir, marcar principal) + editor de premissas com resultados
// automáticos, usando o motor puro de lib/investidor-calculadora.ts (mesma
// lógica que a Luiza usará nos marcos futuros — ver princípio "não duplicar
// lógica entre frontend e Luiza" da especificação).
import { useState } from 'react'
import {
  Plus, Pencil, Copy, Trash2, Star, ArrowLeft, Save, TrendingUp, TrendingDown, Calculator,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { calcularCenario, type PremissasCenario } from '@/lib/investidor-calculadora'
import type { ProspeccaoCenario } from '@/lib/types'

export const MODALIDADE_LABEL: Record<ProspeccaoCenario['modalidade'], string> = {
  vista: 'À vista',
  sac: 'Financiado (SAC)',
  price: 'Financiado (PRICE)',
}

// Campos de premissa como string controlada (permite input vazio) — %
// exibido/editado como número "5" para 5%, convertido para fração (0.05)
// só na hora de calcular/salvar.
type FormState = {
  nome: string
  modalidade: ProspeccaoCenario['modalidade']
  valor_arrematacao: string
  valor_venda_estimado: string
  comissao_leiloeiro: string
  itbi: string
  registro: string
  advogado_desocupacao: string
  reforma: string
  outros_custos: string
  prazo_venda_meses: string
  iptu: string
  condominio: string
  corretagem: string
  imposto_ganho_capital: string
  entrada: string
  taxa_juros: string
  prazo_financiamento_meses: string
}

const FORM_VAZIO: FormState = {
  nome: 'Novo cenário', modalidade: 'vista',
  valor_arrematacao: '', valor_venda_estimado: '',
  comissao_leiloeiro: '5', itbi: '3', registro: '', advogado_desocupacao: '',
  reforma: '', outros_custos: '',
  prazo_venda_meses: '', iptu: '', condominio: '',
  corretagem: '6', imposto_ganho_capital: '15',
  entrada: '20', taxa_juros: '', prazo_financiamento_meses: '',
}

function cenarioParaForm(c: ProspeccaoCenario): FormState {
  const pct = (v: number | null) => v == null ? '' : String(v * 100)
  const num = (v: number | null) => v == null ? '' : String(v)
  return {
    nome: c.nome, modalidade: c.modalidade,
    valor_arrematacao: num(c.valor_arrematacao), valor_venda_estimado: num(c.valor_venda_estimado),
    comissao_leiloeiro: pct(c.comissao_leiloeiro), itbi: pct(c.itbi),
    registro: num(c.registro), advogado_desocupacao: num(c.advogado_desocupacao),
    reforma: num(c.reforma), outros_custos: num(c.outros_custos),
    prazo_venda_meses: num(c.prazo_venda_meses), iptu: num(c.iptu), condominio: num(c.condominio),
    corretagem: pct(c.corretagem), imposto_ganho_capital: pct(c.imposto_ganho_capital),
    entrada: pct(c.entrada), taxa_juros: pct(c.taxa_juros),
    prazo_financiamento_meses: num(c.prazo_financiamento_meses),
  }
}

function formParaPremissas(f: FormState): PremissasCenario {
  const num = (s: string): number | null => s.trim() === '' ? null : Number(s)
  const frac = (s: string): number | null => s.trim() === '' ? null : Number(s) / 100
  return {
    modalidade: f.modalidade,
    valor_arrematacao: num(f.valor_arrematacao), valor_venda_estimado: num(f.valor_venda_estimado),
    comissao_leiloeiro: frac(f.comissao_leiloeiro), itbi: frac(f.itbi),
    registro: num(f.registro), advogado_desocupacao: num(f.advogado_desocupacao),
    reforma: num(f.reforma), outros_custos: num(f.outros_custos),
    prazo_venda_meses: num(f.prazo_venda_meses), iptu: num(f.iptu), condominio: num(f.condominio),
    corretagem: frac(f.corretagem), imposto_ganho_capital: frac(f.imposto_ganho_capital),
    entrada: frac(f.entrada), taxa_juros: frac(f.taxa_juros),
    prazo_financiamento_meses: num(f.prazo_financiamento_meses),
  }
}

export function ProspeccaoCenarios({
  prospeccaoId, cenarios, onChanged,
}: { prospeccaoId: string; cenarios: ProspeccaoCenario[]; onChanged: () => void }) {
  const [modo, setModo] = useState<'lista' | 'novo' | string>('lista')

  if (modo === 'lista') {
    return <ListaCenarios cenarios={cenarios} onNovo={() => setModo('novo')} onEditar={id => setModo(id)} onChanged={onChanged} />
  }

  const editando = modo === 'novo' ? null : (cenarios.find(c => c.id === modo) ?? null)
  return (
    <EditorCenario
      prospeccaoId={prospeccaoId}
      cenario={editando}
      onVoltar={() => setModo('lista')}
      onSalvo={() => { setModo('lista'); onChanged() }}
    />
  )
}

function ListaCenarios({
  cenarios, onNovo, onEditar, onChanged,
}: { cenarios: ProspeccaoCenario[]; onNovo: () => void; onEditar: (id: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  async function marcarPrincipal(c: ProspeccaoCenario) {
    setBusy(c.id)
    const supabase = createClient()
    const { error } = await supabase.rpc('prospeccao_cenario_definir_principal', {
      p_prospeccao_id: c.prospeccao_id, p_cenario_id: c.id,
    })
    setBusy(null)
    if (error) { alert(`Não foi possível marcar como principal: ${error.message}`); return }
    onChanged()
  }

  async function duplicar(c: ProspeccaoCenario) {
    setBusy(c.id)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, principal, ...resto } = c
    const { error } = await supabase.from('prospeccao_cenarios').insert({
      ...resto, nome: `${c.nome} (cópia)`, principal: false,
    })
    setBusy(null)
    if (error) { alert(`Não foi possível duplicar: ${error.message}`); return }
    onChanged()
  }

  async function excluir(c: ProspeccaoCenario) {
    if (!confirm(`Excluir o cenário "${c.nome}"? Essa ação não pode ser desfeita.`)) return
    setBusy(c.id)
    const supabase = createClient()
    const { error } = await supabase.from('prospeccao_cenarios').delete().eq('id', c.id)
    setBusy(null)
    if (error) { alert(`Não foi possível excluir: ${error.message}`); return }
    onChanged()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Cenários financeiros</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>À vista, SAC ou PRICE — compare quantos cenários quiser e marque o principal.</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={onNovo}>Novo cenário</Button>
      </div>

      {cenarios.length === 0 ? (
        <EmptyState icon={Calculator} title="Nenhum cenário ainda" description="Crie o primeiro cenário para calcular investimento, lucro e rentabilidade." action={
          <Button size="sm" icon={<Plus size={14} />} onClick={onNovo}>Novo cenário</Button>
        } />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cenarios.map(c => {
            const temResultado = c.lucro != null && c.rentabilidade != null
            const positivo = (c.lucro ?? 0) >= 0
            return (
              <div key={c.id} className="card p-4 flex flex-col gap-3" style={c.principal ? { borderColor: 'var(--accent)' } : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {c.principal && <Star size={13} fill="var(--accent)" style={{ color: 'var(--accent)' }} />}
                      <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.nome}</p>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{MODALIDADE_LABEL[c.modalidade]}</p>
                  </div>
                  {!c.principal && (
                    <button
                      onClick={() => marcarPrincipal(c)}
                      disabled={busy === c.id}
                      className="text-xs font-medium px-2 py-1 rounded-md flex-shrink-0 disabled:opacity-50"
                      style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      title="Marcar como principal"
                    >
                      Marcar principal
                    </button>
                  )}
                </div>

                {temResultado ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Investimento total</p>
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.investimento_total!)}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Valor líquido de venda</p>
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.valor_liquido_venda!)}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Lucro</p>
                      <p className="font-semibold flex items-center gap-1" style={{ color: positivo ? 'var(--success)' : 'var(--danger)' }}>
                        {positivo ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {formatCurrency(c.lucro!)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Rentabilidade</p>
                      <p className="font-semibold" style={{ color: positivo ? 'var(--success)' : 'var(--danger)' }}>{c.rentabilidade!.toFixed(1)}%</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Preencha as premissas para calcular o resultado.</p>
                )}

                <div className="flex items-center gap-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => onEditar(c.id)} className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md" style={{ color: 'var(--text-secondary)' }}>
                    <Pencil size={12} /> Editar
                  </button>
                  <button onClick={() => duplicar(c)} disabled={busy === c.id} className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>
                    <Copy size={12} /> Duplicar
                  </button>
                  <button onClick={() => excluir(c)} disabled={busy === c.id} className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md disabled:opacity-50 ml-auto" style={{ color: 'var(--danger)' }}>
                    <Trash2 size={12} /> Excluir
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EditorCenario({
  prospeccaoId, cenario, onVoltar, onSalvo,
}: { prospeccaoId: string; cenario: ProspeccaoCenario | null; onVoltar: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState<FormState>(cenario ? cenarioParaForm(cenario) : FORM_VAZIO)
  const [saving, setSaving] = useState(false)

  const premissas = formParaPremissas(form)
  const resultado = calcularCenario(premissas)
  const financiado = form.modalidade !== 'vista'
  const positivo = resultado.lucro >= 0

  function campo(k: keyof FormState, label: string, opts?: { hint?: string; type?: string }) {
    return (
      <Input
        label={label}
        type={opts?.type ?? 'number'}
        inputMode="decimal"
        hint={opts?.hint}
        value={form[k]}
        onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
      />
    )
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = { prospeccao_id: prospeccaoId, nome: form.nome.trim(), ...premissas, ...resultado }
    const { error } = cenario
      ? await supabase.from('prospeccao_cenarios').update(payload).eq('id', cenario.id)
      : await supabase.from('prospeccao_cenarios').insert(payload)
    setSaving(false)
    if (error) { alert(`Não foi possível salvar: ${error.message}`); return }
    onSalvo()
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-sm font-medium w-fit" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={14} /> Cenários
      </button>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nome do cenário" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
        <Select label="Modalidade" value={form.modalidade} onChange={e => setForm(f => ({ ...f, modalidade: e.target.value as ProspeccaoCenario['modalidade'] }))}>
          <option value="vista">À vista</option>
          <option value="sac">Financiado — SAC</option>
          <option value="price">Financiado — PRICE</option>
        </Select>
      </div>

      <div className="card p-4" style={{ borderColor: positivo ? 'var(--accent)' : 'var(--danger)' }}>
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>RESULTADO (atualizado automaticamente)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Resultado label="Investimento total" valor={formatCurrency(resultado.investimento_total)} />
          <Resultado label="Valor líquido de venda" valor={formatCurrency(resultado.valor_liquido_venda)} />
          <Resultado label="Lucro" valor={formatCurrency(resultado.lucro)} positivo={positivo} />
          <Resultado label="Rentabilidade" valor={`${resultado.rentabilidade.toFixed(1)}%`} positivo={positivo} />
        </div>
      </div>

      <Secao titulo="Imóvel">
        {campo('valor_arrematacao', 'Valor da arrematação', { hint: 'R$' })}
        {campo('valor_venda_estimado', 'Valor da venda estimado', { hint: 'R$' })}
      </Secao>

      {financiado && (
        <Secao titulo="Estrutura do financiamento">
          {campo('entrada', '% da entrada', { hint: '% do valor de arrematação' })}
          {campo('taxa_juros', 'Taxa de juros anual', { hint: '%' })}
          {campo('prazo_financiamento_meses', 'Prazo do financiamento', { hint: 'meses' })}
        </Secao>
      )}

      <Secao titulo="Custos da arrematação">
        {campo('comissao_leiloeiro', 'Comissão do leiloeiro', { hint: '%' })}
        {campo('itbi', 'ITBI', { hint: '%' })}
        {campo('registro', 'Registro', { hint: 'R$' })}
        {campo('advogado_desocupacao', 'Advogado / desocupação', { hint: 'R$' })}
      </Secao>

      <Secao titulo="Extras pós imissão">
        {campo('reforma', 'Reforma', { hint: 'R$' })}
        {campo('outros_custos', 'Outros custos', { hint: 'R$' })}
      </Secao>

      <Secao titulo="Pós arrematação">
        {campo('prazo_venda_meses', 'Prazo até a venda', { hint: 'meses' })}
        {campo('iptu', 'IPTU mensal', { hint: 'R$/mês' })}
        {campo('condominio', 'Condomínio mensal', { hint: 'R$/mês' })}
      </Secao>

      <Secao titulo="Pós venda">
        {campo('corretagem', 'Comissão do corretor', { hint: '%' })}
        {campo('imposto_ganho_capital', 'Imposto sobre ganho de capital', { hint: '%' })}
      </Secao>

      <div className="flex justify-end gap-2 pb-2">
        <Button variant="secondary" onClick={onVoltar} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSave} loading={saving} icon={<Save size={14} />} disabled={!form.nome.trim()}>Salvar cenário</Button>
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{titulo}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Resultado({ label, valor, positivo }: { label: string; valor: string; positivo?: boolean }) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="font-bold text-sm sm:text-base" style={{ color: positivo === undefined ? 'var(--text-primary)' : positivo ? 'var(--success)' : 'var(--danger)' }}>{valor}</p>
    </div>
  )
}
