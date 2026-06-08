'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { BaseAntigaDados, lerBaseAntiga } from '@/lib/import-base-antiga'

type Props = {
  open: boolean
  onClose: () => void
  onConcluido: () => void
}

type Resultado = {
  insumos: number
  composicoes: number
  vinculos: number
  erros: string[]
}

const BATCH = 200

function chunks<T>(items: T[], size = BATCH) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function resumoErro(error: any) {
  return error?.message || 'Erro desconhecido ao gravar no banco.'
}

export function ImportarBaseAntigaModal({ open, onClose, onConcluido }: Props) {
  const supabase = createClient()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [dados, setDados] = useState<BaseAntigaDados | null>(null)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  function reset() {
    setArquivo(null)
    setDados(null)
    setResultado(null)
  }

  function fechar() {
    if (importando) return
    reset()
    onClose()
  }

  async function handleArquivo(file: File) {
    setArquivo(file)
    setDados(null)
    setResultado(null)
    setLendo(true)
    try {
      const parsed = await lerBaseAntiga(file)
      setDados(parsed)
    } catch {
      setDados({ insumos: [], composicoes: [], vinculos: [], erros: ['Nao foi possivel ler a planilha. Confirme se e um arquivo .xlsx valido.'] })
    } finally {
      setLendo(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleArquivo(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleArquivo(file)
  }

  async function importar() {
    if (!dados || dados.insumos.length === 0 || dados.composicoes.length === 0) return
    setImportando(true)

    const erros = [...dados.erros]
    let insumosOk = 0
    let composicoesOk = 0
    let vinculosOk = 0

    for (const lote of chunks(dados.insumos)) {
      const payload = lote.map(insumo => ({
        codigo: insumo.codigo,
        descricao: insumo.descricao,
        unidade: insumo.unidade,
        categoria: insumo.categoria,
        grupo: insumo.grupo,
        preco_unitario: insumo.precoUnitario,
        ativo: insumo.ativo,
      }))
      const { data, error } = await supabase
        .from('insumos_proprios')
        .upsert(payload, { onConflict: 'codigo' })
        .select('id,codigo')
      if (error) erros.push(`Insumos: ${resumoErro(error)}`)
      else insumosOk += data?.length ?? payload.length
    }

    for (const lote of chunks(dados.composicoes)) {
      const payload = lote.map(comp => ({
        codigo: comp.codigo,
        descricao: comp.descricao,
        unidade: comp.unidade,
        grupo: 'GERAL',
        ativo: comp.ativo,
      }))
      const { data, error } = await supabase
        .from('composicoes_proprias')
        .upsert(payload, { onConflict: 'codigo' })
        .select('id,codigo')
      if (error) erros.push(`Composicoes: ${resumoErro(error)}`)
      else composicoesOk += data?.length ?? payload.length
    }

    const codigosInsumos = dados.insumos.map(i => i.codigo)
    const codigosComposicoes = dados.composicoes.map(c => c.codigo)
    const insumoIds = new Map<string, string>()
    const composicaoIds = new Map<string, string>()

    for (const lote of chunks(codigosInsumos)) {
      const { data, error } = await supabase.from('insumos_proprios').select('id,codigo').in('codigo', lote)
      if (error) erros.push(`Buscar insumos gravados: ${resumoErro(error)}`)
      for (const row of data || []) insumoIds.set(row.codigo, row.id)
    }

    for (const lote of chunks(codigosComposicoes)) {
      const { data, error } = await supabase.from('composicoes_proprias').select('id,codigo').in('codigo', lote)
      if (error) erros.push(`Buscar composicoes gravadas: ${resumoErro(error)}`)
      for (const row of data || []) composicaoIds.set(row.codigo, row.id)
    }

    const codigoPorIdInsumo = new Map(dados.insumos.map(i => [i.idAntigo, i.codigo]))
    const codigoPorIdComposicao = new Map(dados.composicoes.map(c => [c.idAntigo, c.codigo]))
    const idsComposicoesImportadas = Array.from(composicaoIds.values())

    for (const lote of chunks(idsComposicoesImportadas)) {
      const { error } = await supabase.from('composicao_insumos').delete().in('composicao_id', lote)
      if (error) erros.push(`Limpar vinculos antigos: ${resumoErro(error)}`)
    }

    const vinculosPayload = dados.vinculos.flatMap(vinculo => {
      const codigoComposicao = codigoPorIdComposicao.get(vinculo.composicaoIdAntigo)
      const codigoInsumo = codigoPorIdInsumo.get(vinculo.insumoIdAntigo)
      const composicao_id = codigoComposicao ? composicaoIds.get(codigoComposicao) : null
      const insumo_proprio_id = codigoInsumo ? insumoIds.get(codigoInsumo) : null
      if (!composicao_id || !insumo_proprio_id) {
        erros.push(`Vinculo ignorado: composicao antiga ${vinculo.composicaoIdAntigo}, insumo antigo ${vinculo.insumoIdAntigo}.`)
        return []
      }
      return [{ composicao_id, insumo_proprio_id, coeficiente: vinculo.coeficiente }]
    })

    for (const lote of chunks(vinculosPayload)) {
      const { data, error } = await supabase.from('composicao_insumos').insert(lote).select('id')
      if (error) erros.push(`Vinculos: ${resumoErro(error)}`)
      else vinculosOk += data?.length ?? lote.length
    }

    setResultado({ insumos: insumosOk, composicoes: composicoesOk, vinculos: vinculosOk, erros })
    setImportando(false)
    if (insumosOk || composicoesOk || vinculosOk) onConcluido()
  }

  return (
    <Modal open={open} onClose={fechar} title="Importar base antiga" size="lg">
      <div className="flex flex-col gap-5">
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          <p>
            Use a planilha com as abas <strong>Insumos</strong>, <strong>Composições</strong> e <strong>Itens_Composição</strong>.
            O sistema atualiza os cadastros pelo código e recria os vínculos das composições importadas.
          </p>
        </div>

        <label
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all hover:opacity-80"
          style={{ borderColor: 'var(--border)' }}
        >
          {lendo ? (
            <>
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Lendo base antiga...</p>
            </>
          ) : arquivo ? (
            <>
              <CheckCircle2 size={28} style={{ color: 'var(--success)' }} />
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{arquivo.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Clique para trocar o arquivo</p>
              </div>
            </>
          ) : (
            <>
              <Upload size={28} style={{ color: 'var(--text-secondary)' }} />
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Arraste o XLSX ou clique para selecionar</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Importa insumos, composições e vínculos</p>
              </div>
            </>
          )}
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />
        </label>

        {dados && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              ['Insumos', dados.insumos.length],
              ['Composições', dados.composicoes.length],
              ['Vínculos', dados.vinculos.length],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{Number(value).toLocaleString('pt-BR')}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {dados && dados.erros.length > 0 && (
          <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            <p className="font-medium mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> Avisos na leitura:</p>
            {dados.erros.slice(0, 6).map((erro, i) => <p key={i}>{erro}</p>)}
            {dados.erros.length > 6 && <p>+ {dados.erros.length - 6} avisos adicionais...</p>}
          </div>
        )}

        {resultado && (
          <div className="flex flex-col gap-3">
            <div className="p-4 rounded-lg text-sm" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--text-primary)' }}>
              <strong>{resultado.insumos}</strong> insumo(s), <strong>{resultado.composicoes}</strong> composição(ões) e <strong>{resultado.vinculos}</strong> vínculo(s) processados.
            </div>
            {resultado.erros.length > 0 && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                {resultado.erros.slice(0, 8).map((erro, i) => <p key={i}>{erro}</p>)}
                {resultado.erros.length > 8 && <p>+ {resultado.erros.length - 8} erros adicionais...</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={fechar} disabled={importando}>Fechar</Button>
          {dados && !resultado && (
            <Button
              onClick={importar}
              loading={importando}
              disabled={dados.insumos.length === 0 || dados.composicoes.length === 0}
              icon={<Database size={15} />}
            >
              Importar base completa
            </Button>
          )}
          {resultado && (
            <Button onClick={fechar} icon={<FileSpreadsheet size={15} />}>Concluir</Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
