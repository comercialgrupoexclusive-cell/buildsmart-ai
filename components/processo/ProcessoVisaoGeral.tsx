'use client'

import { useState } from 'react'
import { CalendarDays, MapPin, Pencil, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { alterarStatusProcesso, atualizarDadosProcesso, campoOcultoPor, type Processo, type ProcessoStatus, type ProcessoTemplate } from '@/lib/processo'
import { Button } from '@/components/ui/Button'
import { ProcessoDadosForm, type DadosProcesso } from './ProcessoDadosForm'
import { ProcessoImovelBloco } from './ProcessoImovelBloco'

// Aba de abertura do Processo: os dados de cadastro, em leitura, com edição
// no mesmo lugar. Usa o mesmo formulário do "Editar" da listagem — não há
// uma segunda versão dos campos para divergir depois.

export function ProcessoVisaoGeral({ processo, template, onAtualizado }: {
  processo: Processo
  template?: ProcessoTemplate | null
  onAtualizado: (p: Processo) => void
}) {
  const [editando, setEditando] = useState(false)

  async function salvar(dados: DadosProcesso) {
    const supabase = createClient()
    const { status, ...patch } = dados
    let atualizado = await atualizarDadosProcesso(supabase, processo.id, patch)
    if (status && status !== processo.status) {
      atualizado = await alterarStatusProcesso(supabase, processo.id, status as ProcessoStatus)
    }
    onAtualizado(atualizado)
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="card p-5">
        <h2 className="mb-4 font-semibold" style={{ color: 'var(--text-primary)' }}>Dados do processo</h2>
        <ProcessoDadosForm processo={processo} template={template} onSalvar={salvar} onCancelar={() => setEditando(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
    <div className="card overflow-hidden">
      {processo.capa_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={processo.capa_url} alt="" className="h-40 w-full object-cover" />
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Dados do processo</h2>
          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => setEditando(true)}>
            Editar
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {!campoOcultoPor(template, 'cliente_nome') && (
            <Campo icone={<User size={14} />} rotulo="Cliente" valor={processo.cliente_nome} />
          )}
          {!campoOcultoPor(template, 'endereco') && (
            <Campo icone={<MapPin size={14} />} rotulo="Endereço" valor={processo.endereco} />
          )}
          {!campoOcultoPor(template, 'tipo') && <Campo rotulo="Tipo" valor={processo.tipo} />}
          <Campo
            icone={<CalendarDays size={14} />}
            rotulo="Criado em"
            valor={new Date(processo.created_at).toLocaleDateString('pt-BR')}
          />
        </dl>
      </div>
    </div>

    <ProcessoImovelBloco processoId={processo.id} processoNome={processo.nome} />
    </div>
  )
}

function Campo({ icone, rotulo, valor }: { icone?: React.ReactNode; rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {icone}
        {rotulo}
      </dt>
      <dd className="mt-0.5 text-sm" style={{ color: valor ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {valor || 'Não informado'}
      </dd>
    </div>
  )
}
