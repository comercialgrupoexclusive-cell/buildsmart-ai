'use client'

// Interface pura do branding da organização: recebe os valores atuais e as
// ações por props e não sabe de onde vêm os dados nem onde são gravados. Quem
// liga isso ao banco é o OrganizacaoBranding (container).

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ASSISTENTE_NOME_MAX } from '@/lib/organizacao/branding'

export type DadosBranding = {
  assistenteNome: string
  logoUrl: string | null
}

type Props = {
  nomeOrganizacao: string
  inicial: DadosBranding
  onSalvar: (dados: DadosBranding) => Promise<void>
  onEnviarLogo: (arquivo: File) => Promise<string>
}

function Avatar({ logoUrl, nome }: { logoUrl: string | null; nome: string }) {
  const caixa = 'grid size-16 flex-shrink-0 place-items-center overflow-hidden rounded-xl'
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={`${caixa} object-cover`} />
    )
  }
  return (
    <div
      className={`${caixa} text-xl font-bold text-white`}
      style={{ background: 'var(--accent)' }}
    >
      {nome.trim().charAt(0).toUpperCase() || 'O'}
    </div>
  )
}

export function OrganizacaoBrandingCard({
  nomeOrganizacao, inicial, onSalvar, onEnviarLogo,
}: Props) {
  const [assistenteNome, setAssistenteNome] = useState(inicial.assistenteNome)
  const [logoUrl, setLogoUrl] = useState(inicial.logoUrl)
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const alterado =
    assistenteNome.trim() !== inicial.assistenteNome || logoUrl !== inicial.logoUrl

  async function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro('')
    setEnviando(true)
    try {
      setLogoUrl(await onEnviarLogo(arquivo))
      setSalvo(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a imagem.')
    } finally {
      setEnviando(false)
      if (inputArquivo.current) inputArquivo.current.value = ''
    }
  }

  async function salvar() {
    setErro('')
    setSalvando(true)
    try {
      await onSalvar({ assistenteNome: assistenteNome.trim(), logoUrl })
      setSalvo(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="card p-6">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        Identidade da organização
      </h2>
      <p className="mb-5 mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        O nome do assistente de IA e a foto aparecem para todos os usuários de{' '}
        {nomeOrganizacao || 'esta organização'}.
      </p>

      <div className="flex items-center gap-4">
        <Avatar logoUrl={logoUrl} nome={nomeOrganizacao} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={enviando}
            icon={enviando ? <Loader2 size={14} /> : <ImagePlus size={14} />}
            onClick={() => inputArquivo.current?.click()}
          >
            {logoUrl ? 'Trocar foto' : 'Enviar foto'}
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={() => { setLogoUrl(null); setSalvo(false) }}
            >
              Remover
            </Button>
          )}
        </div>
        <input
          ref={inputArquivo}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => void escolherLogo(e.target.files?.[0])}
        />
      </div>

      <div className="mt-5">
        <Input
          label="Nome do assistente de IA"
          value={assistenteNome}
          maxLength={ASSISTENTE_NOME_MAX}
          onChange={e => { setAssistenteNome(e.target.value); setSalvo(false) }}
          hint="É como o assistente se apresenta no chat e nos menus."
          placeholder="Assistente"
        />
      </div>

      {erro && <p className="mt-3 text-xs" style={{ color: '#f87171' }}>{erro}</p>}

      <div className="mt-5 flex items-center justify-end gap-3">
        {salvo && !alterado && (
          <span className="text-xs" style={{ color: 'var(--success)' }}>Salvo.</span>
        )}
        <Button onClick={() => void salvar()} loading={salvando} disabled={!alterado}>
          Salvar
        </Button>
      </div>
    </div>
  )
}
