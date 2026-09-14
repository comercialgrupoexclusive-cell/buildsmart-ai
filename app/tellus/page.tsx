import type { Metadata } from 'next'
import { TellusExperience } from './TellusExperience'

// Experimento visual "Tellus" (branch experimento/tellus-hero) — isolado do
// núcleo operacional do BuildSmart: nenhuma leitura/escrita no Supabase,
// sem autenticação (ver exclusão em middleware.ts), sem link a partir do
// app principal. Existe só como link de preview pra validar a direção
// visual (globo 3D + painéis de vidro) antes de qualquer decisão de levar
// isso pro produto.
export const metadata: Metadata = {
  title: 'Tellus — O Ambiente Inteligente',
  description: 'Experimento visual — do real ao possível.',
}

export default function TellusPage() {
  return <TellusExperience />
}
