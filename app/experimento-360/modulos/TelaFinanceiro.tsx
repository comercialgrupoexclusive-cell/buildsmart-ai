'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrCreateOrcamentoDoProcesso } from '@/lib/processo/orcamento'
import type { ProcessoTemplateKey } from '@/lib/processo'
import { ObraAvancoFinanceiro } from '@/components/obra/ObraAvancoFinanceiro'
import { ComprasLancamentos } from '@/components/obra/ComprasLancamentos'
import { Carregando, PrecisaSessao, SubAbas } from './comuns'
import { FinanceiroInvestidor } from './FinanceiroInvestidor'

// Financeiro do Processo — primeira experiência, sem ERP novo.
//
// "Resumo" é o mesmo ObraAvancoFinanceiro que /processos/[id] já renderiza
// (fonte única de números: lib/financeiro.ts). "Lançamentos" é o mesmo
// ComprasLancamentos do padrão Compras/Despesas, que já grava em
// `compra_itens` com `processo_id` — ou seja, o vínculo com o Processo é o
// canônico, não um vínculo inventado para esta tela.
//
// Pendência consciente: hoje `compra_itens` só representa SAÍDA. Não existe
// no schema uma tabela canônica de lançamento genérico entrada/saída
// (entradas aparecem só como `obra_reembolsos`, ligadas a financiamento). Um
// campo entrada/saída aqui exigiria tabela nova — decisão de produto, fora
// do que esta etapa deve inventar.
//
// Compatibilização Funcional 01/parte B — Orçamento/compra_itens NÃO
// representa corretamente investimento imobiliário (não é o mesmo tipo de
// custo, não tem entrada, mistura com etapas de obra). Processos do template
// `investimento_imobiliario_investidor` usam o Financeiro Real
// (lib/processo-financeiro) em vez deste Financeiro de obra — Processos
// antigos/de obra continuam exatamente como estavam, nada aqui foi removido.

type AbaFinanceiro = 'resumo' | 'lancamentos'

export function TelaFinanceiro({ processoId, templateKey }: { processoId: string; templateKey?: ProcessoTemplateKey | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [aba, setAba] = useState<AbaFinanceiro>('lancamentos')
  const [orcamentoId, setOrcamentoId] = useState<string | null>(null)
  const [semSessao, setSemSessao] = useState(false)
  const [erro, setErro] = useState('')

  const ehInvestidor = templateKey === 'investimento_imobiliario_investidor'

  useEffect(() => {
    if (ehInvestidor) return
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!vivo) return
      if (!data.user) { setSemSessao(true); return }
      try {
        const id = await getOrCreateOrcamentoDoProcesso(supabase, processoId)
        if (vivo) setOrcamentoId(id)
      } catch {
        if (vivo) setErro('Não foi possível abrir o orçamento deste Processo.')
      }
    })()
    return () => { vivo = false }
  }, [supabase, processoId, ehInvestidor])

  if (ehInvestidor) return <FinanceiroInvestidor processoId={processoId} />

  if (semSessao) return <PrecisaSessao modulo="O Financeiro do Processo" />
  if (erro) return <p className="py-10 text-center text-[13px] text-red-300/85">{erro}</p>
  if (!orcamentoId) return <Carregando texto="Abrindo o financeiro…" />

  return (
    <div className="flex flex-col gap-3">
      <SubAbas
        valor={aba}
        onMudar={setAba}
        abas={[
          { id: 'lancamentos', rotulo: 'Lançamentos' },
          { id: 'resumo', rotulo: 'Resumo' },
        ]}
      />

      {aba === 'resumo' ? (
        <ObraAvancoFinanceiro
          key={orcamentoId}
          processoId={processoId}
          orcamentoId={orcamentoId}
          orcamentoIds={[orcamentoId]}
        />
      ) : (
        <ComprasLancamentos
          key={orcamentoId}
          processoId={processoId}
          orcamentoId={orcamentoId}
          orcamentoIds={[orcamentoId]}
        />
      )}
    </div>
  )
}
