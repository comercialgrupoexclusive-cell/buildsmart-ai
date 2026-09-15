'use client'

import type { Processo } from '@/lib/processo'

// Visão geral do Processo — deliberadamente simples nesta etapa: identidade e
// estado do Processo, lidos do próprio registro. Nada de painel analítico;
// os números vivem nos módulos que já os calculam.

const STATUS_ROTULO: Record<string, string> = {
  ACTIVE: 'Ativo',
  ON_HOLD: 'Em espera',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
}

const dataCurta = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/50">{rotulo}</div>
      <div className="mt-1 text-[14px] text-white/88">{valor}</div>
    </div>
  )
}

export function TelaVisaoGeral({ processo, modulos }: { processo: Processo; modulos: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[19px] font-semibold text-white/92">{processo.nome}</h3>
        <p className="mt-0.5 text-[13px] text-white/50">
          {[processo.tipo, processo.cliente_nome].filter(Boolean).join(' · ') || 'Sem dados adicionais'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Situação" valor={STATUS_ROTULO[processo.status] ?? processo.status} />
        <Campo rotulo="Endereço" valor={processo.endereco || '—'} />
        <Campo rotulo="Aberto em" valor={dataCurta(processo.created_at)} />
        <Campo rotulo="Última atualização" valor={dataCurta(processo.updated_at)} />
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
        <div className="text-[10.5px] uppercase tracking-[0.12em] text-cyan-200/50">Módulos habilitados</div>
        {modulos.length === 0 ? (
          <p className="mt-2 text-[13px] text-white/50">
            Nenhum módulo habilitado ainda. Habilite em Config.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {modulos.map(m => (
              <span key={m} className="rounded-full border border-cyan-200/18 bg-cyan-300/10 px-2.5 py-1 text-[12px] text-cyan-100/80">
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
