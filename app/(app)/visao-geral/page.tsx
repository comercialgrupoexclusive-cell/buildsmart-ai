import { VisaoGeral } from '@/components/dashboard/VisaoGeral'

// Visão Geral — por ora, do módulo investidor (compra, reforma, venda). A
// composição é por módulo + preferência do usuário/organização; outros módulos
// entram no mesmo registry depois.
export default function VisaoGeralPage() {
  return <VisaoGeral modulo="investidor" />
}
