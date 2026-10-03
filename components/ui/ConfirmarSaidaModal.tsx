'use client'

// Aviso de "alterações não salvas" com três saídas claras. Interface pura: só
// recebe o estado e avisa a escolha; quem decide o que fazer é o chamador.
// (O confirm() do navegador só tem OK/Cancelar, e aí "Cancelar" vira descartar.)

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export type EscolhaDeSaida = 'salvar' | 'descartar' | 'continuar'

type Props = {
  aberto: boolean
  salvando: boolean
  erro: string | null
  onEscolher: (escolha: EscolhaDeSaida) => void
}

export function ConfirmarSaidaModal({ aberto, salvando, erro, onEscolher }: Props) {
  return (
    <Modal
      open={aberto}
      onClose={() => { if (!salvando) onEscolher('continuar') }}
      title="Alterações não salvas"
      size="sm"
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Você editou algo e ainda não salvou. O que quer fazer antes de sair?
      </p>

      {erro && (
        <p className="mt-3 text-xs" style={{ color: '#f87171' }}>
          {erro} Você continua nesta tela.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <Button onClick={() => onEscolher('salvar')} loading={salvando}>
          Salvar e sair
        </Button>
        <Button
          variant="secondary"
          onClick={() => onEscolher('descartar')}
          disabled={salvando}
        >
          Descartar alterações
        </Button>
        <Button
          variant="ghost"
          onClick={() => onEscolher('continuar')}
          disabled={salvando}
        >
          Continuar editando
        </Button>
      </div>
    </Modal>
  )
}
