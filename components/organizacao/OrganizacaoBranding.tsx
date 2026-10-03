'use client'

// Container do branding: liga a interface (OrganizacaoBrandingCard) aos dados da
// organização. Só aparece para owner/admin; depois de salvar, recarrega o
// contexto para o menu e o chat já mostrarem o novo nome/foto.

import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOrganizacao } from '@/lib/organizacao/contexto'
import { enviarLogo, salvarBranding } from '@/lib/organizacao/branding'
import { OrganizacaoBrandingCard, type DadosBranding } from './OrganizacaoBrandingCard'

export function OrganizacaoBranding() {
  const supabase = useMemo(() => createClient(), [])
  const org = useOrganizacao()

  if (!org.podeEditar || !org.id) return null
  const organizacaoId = org.id

  async function salvar(dados: DadosBranding) {
    await salvarBranding(supabase, dados)
    await org.recarregar()
  }

  return (
    <OrganizacaoBrandingCard
      key={organizacaoId}
      nomeOrganizacao={org.nome}
      inicial={{ assistenteNome: org.assistenteNome, logoUrl: org.logoUrl }}
      onSalvar={salvar}
      onEnviarLogo={arquivo => enviarLogo(supabase, organizacaoId, arquivo)}
    />
  )
}
