'use client'

// Ficha da Prospecção (Skill 1 — Pesquisa e Análise de Mercado Imobiliário).
// Fluxo: FONTE (link/PDF/imagem) → EXTRAÇÃO (Luiza, via /api/investidor/
// mercado) → VALIDAÇÃO HUMANA (esta tela) → DADOS CONFIRMADOS.
//
// REGRA FUNDAMENTAL: fonte é evidência, não verdade. dados_extraidos nunca é
// sobrescrito pela validação — é o registro do que a fonte realmente disse.
// dados_confirmados é o que o usuário validou/corrigiu e pode divergir (ex.:
// anúncio diz "reformado", usuário confirma "necessita reforma") — nesse
// caso o conflito fica registrado, não escondido.
import { useEffect, useState } from 'react'
import { Link2, FileText, ImagePlus, Sparkles, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { ProspeccaoFicha as ProspeccaoFichaType, ProspeccaoFichaConflito } from '@/lib/types'

const CAMPO_LABEL: Record<string, string> = {
  tipo: 'Tipo do imóvel',
  endereco: 'Endereço/Localização',
  area: 'Área (m²)',
  dormitorios: 'Dormitórios',
  banheiros: 'Banheiros',
  vagas: 'Vagas',
  terraco: 'Terraço',
  churrasqueira: 'Churrasqueira',
  preco_anunciado: 'Preço anunciado',
  condominio: 'Condomínio',
  estado_conservacao: 'Estado/conservação',
}

function labelDoCampo(campo: string) {
  return CAMPO_LABEL[campo] || campo.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

function fmtValor(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

const STATUS_LABEL: Record<ProspeccaoFichaType['status'], string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  validada: 'Validada',
}
const STATUS_COLOR: Record<ProspeccaoFichaType['status'], string> = {
  pendente: '#f59e0b',
  parcial: 'var(--accent)',
  validada: '#10b981',
}

export function ProspeccaoFicha({ prospeccaoId, linkLeilao }: { prospeccaoId: string; linkLeilao?: string | null }) {
  const { currentProfile } = useProfile()
  const [ficha, setFicha] = useState<ProspeccaoFichaType | null>(null)
  const [loading, setLoading] = useState(true)
  const [fonteTipo, setFonteTipo] = useState<'link' | 'pdf' | 'imagem'>('link')
  const [fonteUrl, setFonteUrl] = useState('')
  const [fonteHerdada, setFonteHerdada] = useState(false)
  const [extraindo, setExtraindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmados, setConfirmados] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('prospeccao_ficha').select('*').eq('prospeccao_id', prospeccaoId).maybeSingle()
    const f = (data as ProspeccaoFichaType | null) || null
    setFicha(f)
    if (f) {
      const merge: Record<string, string> = {}
      for (const [k, v] of Object.entries(f.dados_extraidos || {})) merge[k] = fmtValor(f.dados_confirmados?.[k] ?? v)
      for (const [k, v] of Object.entries(f.dados_confirmados || {})) if (!(k in merge)) merge[k] = fmtValor(v)
      setConfirmados(merge)
      setFonteTipo(f.fonte_tipo || 'link')
      // A ficha já tem fonte própria — nunca sobrescrever com o link da
      // Prospecção, mesmo que ele exista.
      if (f.fonte_url) {
        setFonteUrl(f.fonte_url)
        setFonteHerdada(false)
      } else if (linkLeilao) {
        setFonteUrl(linkLeilao)
        setFonteHerdada(true)
      } else {
        setFonteUrl('')
        setFonteHerdada(false)
      }
    } else if (linkLeilao) {
      // Ainda não existe ficha nenhuma: herda o link do leilão já cadastrado
      // na Prospecção, para o usuário não precisar redigitar.
      setFonteUrl(linkLeilao)
      setFonteHerdada(true)
    }
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [prospeccaoId])

  useEffect(() => {
    function onChanged() { void carregar() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospeccaoId])

  async function extrairDeLink() {
    if (!fonteUrl.trim()) { setErro('Informe o link da fonte.'); return }
    setErro(null)
    setExtraindo(true)
    try {
      const res = await fetch('/api/investidor/mercado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extrair_ficha', prospeccaoId, fonteUrl: fonteUrl.trim(), profileId: currentProfile?.id, actor: currentProfile?.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao extrair.')
      if (data.blocked) throw new Error(data.message)
      void carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui extrair os dados dessa fonte.')
    } finally {
      setExtraindo(false)
    }
  }

  async function extrairDeArquivo(file: File) {
    setErro(null)
    setExtraindo(true)
    try {
      let anexo: { tipo: 'imagem' | 'pdf'; nome: string; dataUrl?: string; textoExtraido?: string }
      if (fonteTipo === 'imagem') {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        anexo = { tipo: 'imagem', nome: file.name, dataUrl }
      } else {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/extract-pdf', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao ler o PDF.')
        anexo = { tipo: 'pdf', nome: file.name, textoExtraido: data.texto }
      }
      const res = await fetch('/api/investidor/mercado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extrair_ficha', prospeccaoId, anexo, profileId: currentProfile?.id, actor: currentProfile?.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao extrair.')
      if (data.blocked) throw new Error(data.message)
      void carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui extrair os dados dessa fonte.')
    } finally {
      setExtraindo(false)
    }
  }

  async function salvarValidacao(marcarValidada: boolean) {
    if (!ficha) return
    setSalvando(true)
    const extraidos = ficha.dados_extraidos || {}
    const dadosConfirmados: Record<string, unknown> = {}
    const conflitos: ProspeccaoFichaConflito[] = []
    for (const campo of Object.keys(confirmados)) {
      const valorConfirmado = confirmados[campo]
      if (valorConfirmado.trim() === '') continue
      dadosConfirmados[campo] = valorConfirmado
      const valorExtraido = extraidos[campo]
      if (valorExtraido != null && fmtValor(valorExtraido).trim().toLowerCase() !== valorConfirmado.trim().toLowerCase()) {
        conflitos.push({ campo, valor_extraido: valorExtraido, valor_confirmado: valorConfirmado })
      }
    }
    const camposPendentes = Object.keys(extraidos).filter(c => !confirmados[c] || confirmados[c].trim() === '')
    const status = marcarValidada ? 'validada' : camposPendentes.length === 0 ? 'validada' : 'parcial'
    const supabase = createClient()
    const { error } = await supabase.from('prospeccao_ficha').update({
      dados_confirmados: dadosConfirmados,
      conflitos,
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', ficha.id)
    setSalvando(false)
    if (error) { setErro(`Não foi possível salvar a validação: ${error.message}`); return }
    void carregar()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const campos = ficha ? [...new Set([...Object.keys(ficha.dados_extraidos || {}), ...Object.keys(ficha.dados_confirmados || {})])] : []

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Ficha da Prospecção</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Fonte é evidência, não verdade. A Luiza extrai; você confirma ou corrige.</p>
          </div>
          {ficha && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: `${STATUS_COLOR[ficha.status]}22`, color: STATUS_COLOR[ficha.status] }}>
              {STATUS_LABEL[ficha.status]}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Select label="Fonte" value={fonteTipo} onChange={e => setFonteTipo(e.target.value as 'link' | 'pdf' | 'imagem')}>
            <option value="link">Link do anúncio</option>
            <option value="pdf">PDF</option>
            <option value="imagem">Imagem / print</option>
          </Select>

          {fonteTipo === 'link' ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder="https://..." value={fonteUrl} onChange={e => { setFonteUrl(e.target.value); setFonteHerdada(false) }} className="flex-1" />
                <Button onClick={extrairDeLink} loading={extraindo} icon={<Sparkles size={14} />} className="flex-shrink-0">Extrair da fonte</Button>
              </div>
              {fonteHerdada && fonteUrl && (
                <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}><Link2 size={12} /> Link herdado da Prospecção (leilão) — pode extrair direto ou trocar por outro.</p>
              )}
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-6 cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border)' }}>
              {extraindo ? <Loader2 size={16} className="animate-spin" /> : fonteTipo === 'pdf' ? <FileText size={16} /> : <ImagePlus size={16} />}
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{extraindo ? 'Extraindo...' : `Enviar ${fonteTipo === 'pdf' ? 'PDF' : 'imagem'} da fonte`}</span>
              <input
                type="file"
                accept={fonteTipo === 'pdf' ? 'application/pdf' : 'image/*'}
                className="hidden"
                disabled={extraindo}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void extrairDeArquivo(f) }}
              />
            </label>
          )}

          {erro && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--danger)' }}><AlertTriangle size={13} /> {erro}</p>
          )}
          {ficha?.fonte_url && <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}><Link2 size={12} /> Última fonte: {ficha.fonte_url}</p>}
        </div>
      </div>

      {ficha && campos.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Dados extraídos → validação</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Confirme, corrija ou deixe em branco (pendente) cada campo. Divergências ficam registradas como conflito, não escondidas.</p>

          <div className="flex flex-col gap-3">
            {campos.map(campo => {
              const extraido = ficha.dados_extraidos?.[campo]
              const jaConfirmado = ficha.dados_confirmados?.[campo]
              const divergente = extraido != null && jaConfirmado != null && fmtValor(extraido).trim().toLowerCase() !== fmtValor(jaConfirmado).trim().toLowerCase()
              return (
                <div key={campo} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-2 items-start pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{labelDoCampo(campo)}</p>
                    {divergente && <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: '#f59e0b' }}><AlertTriangle size={10} /> conflito</p>}
                  </div>
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Extraído da fonte</p>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{fmtValor(extraido) || '—'}</p>
                  </div>
                  <Input
                    placeholder="Confirmar/corrigir (em branco = pendente)"
                    value={confirmados[campo] ?? ''}
                    onChange={e => setConfirmados(prev => ({ ...prev, [campo]: e.target.value }))}
                  />
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => salvarValidacao(false)} loading={salvando}>Salvar validação</Button>
            <Button onClick={() => salvarValidacao(true)} loading={salvando} icon={<Check size={14} />}>Marcar ficha como validada</Button>
          </div>
        </div>
      )}

      {!ficha && (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma fonte extraída ainda. Informe um link ou envie um PDF/imagem acima.</p>
        </div>
      )}
    </div>
  )
}
