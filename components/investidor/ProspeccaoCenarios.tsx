'use client'

// Aba "Análise" da Prospecção (Laboratório Investidor, Rodada 3 — Marco 3).
// CRUD completo de Cenários financeiros (múltiplos cenários, duplicar,
// excluir, marcar principal) + editor de premissas com resultados
// automáticos, usando o motor puro de lib/investidor-calculadora.ts (mesma
// lógica que a Luiza usará nos marcos futuros — ver princípio "não duplicar
// lógica entre frontend e Luiza" da especificação).
import { useEffect, useRef, useState } from 'react'
import {
  Plus, Pencil, Copy, Trash2, Star, ArrowLeft, Save, TrendingUp, TrendingDown, Calculator, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { calcularCenario, type PremissasCenario } from '@/lib/investidor-calculadora'
import type { ProspeccaoCenario } from '@/lib/types'

// Premissas genéricas usadas como ponto de partida do cenário "Base"
// auto-criado — as mesmas porcentagens que já eram o valor padrão do
// formulário manual (FORM_VAZIO abaixo). Não são um "dado" do imóvel, são a
// mesma suposição de trabalho que a Luiza/usuário já usava antes.
const PREMISSAS_GENERICAS_BASE = {
  comissao_leiloeiro: 0.05,
  itbi: 0.03,
  corretagem: 0.06,
  imposto_ganho_capital: 0.15,
  entrada: 0.20,
}

export const MODALIDADE_LABEL: Record<ProspeccaoCenario['modalidade'], string> = {
  vista: 'À vista',
  sac: 'Financiado (SAC)',
  price: 'Financiado (PRICE)',
}

// Hotfix pré-reunião: dimensão independente de `modalidade` (forma de
// pagamento) — evita que a Análise fique "excessivamente orientada a
// leilão". Compra direta não tem leiloeiro: o campo de comissão do
// leiloeiro some do formulário e o motor (lib/investidor-calculadora.ts)
// já ignora esse custo para esse tipo, mesmo que venha preenchido.
export const TIPO_AQUISICAO_LABEL: Record<ProspeccaoCenario['tipo_aquisicao'], string> = {
  leilao: 'Leilão',
  compra_direta: 'Compra direta',
}

// Campos de premissa como string controlada (permite input vazio) — %
// exibido/editado como número "5" para 5%, convertido para fração (0.05)
// só na hora de calcular/salvar.
type FormState = {
  nome: string
  modalidade: ProspeccaoCenario['modalidade']
  tipo_aquisicao: ProspeccaoCenario['tipo_aquisicao']
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
  nome: 'Novo cenário', modalidade: 'vista', tipo_aquisicao: 'leilao',
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
    nome: c.nome, modalidade: c.modalidade, tipo_aquisicao: c.tipo_aquisicao,
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
    modalidade: f.modalidade, tipo_aquisicao: f.tipo_aquisicao,
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
  const [criandoBase, setCriandoBase] = useState(false)
  const [erroBase, setErroBase] = useState<string | null>(null)
  const [verTodosMesmoComUm, setVerTodosMesmoComUm] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const jaTentouRef = useRef(false)

  async function duplicarParaComparar(c: ProspeccaoCenario) {
    setDuplicando(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, principal, ...resto } = c
    const { error } = await supabase.from('prospeccao_cenarios').insert({ ...resto, nome: `${c.nome} (cópia)`, principal: false })
    setDuplicando(false)
    if (error) { alert(`Não foi possível duplicar: ${error.message}`); return }
    onChanged()
  }

  async function criarCenarioBase() {
    setCriandoBase(true)
    setErroBase(null)
    const supabase = createClient()
    const [{ data: ficha }, { data: analises }] = await Promise.all([
      supabase.from('prospeccao_ficha').select('dados_confirmados').eq('prospeccao_id', prospeccaoId).maybeSingle(),
      supabase.from('prospeccao_analises_mercado').select('faixa_base').eq('prospeccao_id', prospeccaoId).order('created_at', { ascending: false }).limit(1),
    ])
    const precoConfirmado = (ficha?.dados_confirmados as Record<string, unknown> | null)?.preco_anunciado
    const valorArrematacao = precoConfirmado != null && !Number.isNaN(Number(precoConfirmado)) ? Number(precoConfirmado) : null
    const faixaBaseMercado: number | null = analises?.[0]?.faixa_base ?? null

    const premissas: PremissasCenario = {
      modalidade: 'vista', tipo_aquisicao: 'leilao',
      valor_arrematacao: valorArrematacao, valor_venda_estimado: faixaBaseMercado,
      registro: null, advogado_desocupacao: null,
      reforma: null, outros_custos: null,
      prazo_venda_meses: null, iptu: null, condominio: null,
      taxa_juros: null, prazo_financiamento_meses: null,
      ...PREMISSAS_GENERICAS_BASE,
    }
    const resultado = calcularCenario(premissas)
    const { error } = await supabase.from('prospeccao_cenarios').insert({
      prospeccao_id: prospeccaoId, nome: 'Base', principal: true, ...premissas, ...resultado,
    })
    setCriandoBase(false)
    if (error) { setErroBase(`Não foi possível criar o cenário Base automaticamente: ${error.message}`); return }
    onChanged()
  }

  // Ajuste de produto: a tela não começa mais vazia com só um botão "+ Novo
  // cenário" — na primeira vez que a Prospecção não tem nenhum cenário
  // ainda, criamos automaticamente um cenário "Base" já preenchido com o
  // que já se sabe (preço anunciado da Ficha, valor de mercado da última
  // Análise de Mercado encerrada). Campos sem dado real ficam null (a UI
  // de ListaCenarios/EditorCenario já mostra "—"/"A conferir" para eles —
  // mesmo padrão do orçamento preliminar). Nenhum dado fictício é criado:
  // só o que já existe de verdade na prospecção, mais as mesmas premissas
  // percentuais genéricas que o formulário manual já usava por padrão.
  useEffect(() => {
    if (cenarios.length > 0 || jaTentouRef.current) return
    jaTentouRef.current = true
    void criarCenarioBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospeccaoId, cenarios.length])

  if (criandoBase) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Preparando o cenário Base com os dados já conhecidos…</p>
      </div>
    )
  }

  // Ajuste de produto: com exatamente 1 cenário (o caso comum, já que
  // criamos o "Base" automaticamente), a Viabilidade abre direto na tela
  // completa do cenário — não faz sentido mostrar uma grade pensada para
  // vários cenários com um card só. "Duplicar para comparar" (dentro do
  // EditorCenario) e "Ver todos os cenários" (uma vez que já existam 2+)
  // continuam disponíveis para quando o usuário quiser montar alternativas.
  if (cenarios.length === 1 && modo === 'lista' && !verTodosMesmoComUm) {
    return (
      <div className="flex flex-col gap-4">
        {erroBase && (
          <div className="card p-4 flex items-center gap-2" style={{ borderLeft: '3px solid var(--danger)' }}>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{erroBase}</p>
          </div>
        )}
        <EditorCenario
          prospeccaoId={prospeccaoId}
          cenario={cenarios[0]}
          onVoltar={() => setVerTodosMesmoComUm(true)}
          onSalvo={onChanged}
          voltarLabel="Ver todos os cenários"
          onDuplicar={() => void duplicarParaComparar(cenarios[0])}
          duplicando={duplicando}
        />
      </div>
    )
  }

  if (modo === 'lista') {
    return (
      <div className="flex flex-col gap-4">
        {erroBase && (
          <div className="card p-4 flex items-center gap-2" style={{ borderLeft: '3px solid var(--danger)' }}>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{erroBase}</p>
          </div>
        )}
        <ListaCenarios cenarios={cenarios} onNovo={() => setModo('novo')} onEditar={id => setModo(id)} onChanged={onChanged} />
      </div>
    )
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
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{TIPO_AQUISICAO_LABEL[c.tipo_aquisicao]} · {MODALIDADE_LABEL[c.modalidade]}</p>
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
  prospeccaoId, cenario, onVoltar, onSalvo, voltarLabel, onDuplicar, duplicando,
}: {
  prospeccaoId: string
  cenario: ProspeccaoCenario | null
  onVoltar: () => void
  onSalvo: () => void
  voltarLabel?: string
  onDuplicar?: () => void
  duplicando?: boolean
}) {
  const [form, setForm] = useState<FormState>(cenario ? cenarioParaForm(cenario) : FORM_VAZIO)
  const [saving, setSaving] = useState(false)

  const premissas = formParaPremissas(form)
  const resultado = calcularCenario(premissas)
  const financiado = form.modalidade !== 'vista'
  const compraDireta = form.tipo_aquisicao === 'compra_direta'
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-sm font-medium w-fit" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={14} /> {voltarLabel || 'Cenários'}
        </button>
        {onDuplicar && (
          <button onClick={onDuplicar} disabled={duplicando} className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-md disabled:opacity-50" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <Copy size={12} /> Duplicar para comparar
          </button>
        )}
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nome do cenário" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
        <Select
          label="Tipo de aquisição"
          value={form.tipo_aquisicao}
          onChange={e => setForm(f => ({ ...f, tipo_aquisicao: e.target.value as ProspeccaoCenario['tipo_aquisicao'] }))}
        >
          <option value="leilao">Leilão</option>
          <option value="compra_direta">Compra direta</option>
        </Select>
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
        {campo('valor_arrematacao', 'Valor de aquisição', { hint: 'R$' })}
        {campo('valor_venda_estimado', 'Valor da venda estimado', { hint: 'R$' })}
      </Secao>

      {financiado && (
        <Secao titulo="Estrutura do financiamento">
          {campo('entrada', '% da entrada', { hint: '% do valor de aquisição' })}
          {campo('taxa_juros', 'Taxa de juros anual', { hint: '%' })}
          {campo('prazo_financiamento_meses', 'Prazo do financiamento', { hint: 'meses' })}
        </Secao>
      )}

      <Secao titulo="Custos de aquisição">
        {!compraDireta && campo('comissao_leiloeiro', 'Comissão do leiloeiro', { hint: '%' })}
        {campo('itbi', 'ITBI', { hint: '%' })}
        {campo('registro', 'Registro', { hint: 'R$' })}
        {campo('advogado_desocupacao', 'Advogado / desocupação', { hint: 'R$' })}
      </Secao>

      <Secao titulo="Extras pós aquisição">
        {campo('reforma', 'Reforma', { hint: 'R$' })}
        {campo('outros_custos', 'Outros custos', { hint: 'R$' })}
      </Secao>

      <Secao titulo="Pós aquisição">
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
