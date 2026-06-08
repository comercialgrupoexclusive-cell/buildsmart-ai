'use client'

import { useState } from 'react'
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Database } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  ConfigImportacao, LinhaImportada, ResultadoLeitura,
  baixarModeloXLSX, lerPlanilhaImportacao,
} from '@/lib/import-export-templates'
import {
  CONFIG_IMPORT_ORCAMENTO,
  LinhaOrcamentoTabular,
  exportarOrcamentoTabularXLSX,
  lerPlanilhaOrcamentoAntigo,
} from '@/lib/import-export-orcamento'

export type ResultadoImportacaoOrcamento = { inseridos: number; ignorados: number; erros: string[] }

type Props = {
  open: boolean
  onClose: () => void
  linhasAtuais: LinhaOrcamentoTabular[]
  obraName: string
  versao: number
  onImportar: (linhas: LinhaImportada[]) => Promise<ResultadoImportacaoOrcamento>
}

type Etapa = 'opcoes' | 'upload' | 'previa' | 'resultado'
type ModoImportacao = 'tabular' | 'sistema_antigo'

const config: ConfigImportacao = CONFIG_IMPORT_ORCAMENTO

export function ImportarExportarOrcamentoModal({ open, onClose, linhasAtuais, obraName, versao, onImportar }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('opcoes')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [lendo, setLendo] = useState(false)
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null)
  const [modoImportacao, setModoImportacao] = useState<ModoImportacao>('tabular')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacaoOrcamento | null>(null)

  function reiniciar() {
    setEtapa('opcoes')
    setArquivo(null)
    setLeitura(null)
    setResultado(null)
  }

  function fechar() {
    if (importando) return
    reiniciar()
    onClose()
  }

  async function handleArquivo(f: File) {
    setArquivo(f)
    setLendo(true)
    setLeitura(null)
    try {
      const res = modoImportacao === 'sistema_antigo'
        ? await lerPlanilhaOrcamentoAntigo(f)
        : await lerPlanilhaImportacao(f, config)
      setLeitura(res)
      setEtapa('previa')
    } catch {
      setLeitura({ linhas: [], erros: ['Não foi possível ler o arquivo. Verifique se é uma planilha .xlsx válida.'] })
      setEtapa('previa')
    }
    setLendo(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleArquivo(f)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleArquivo(f)
  }

  async function confirmarImportacao(linhas: LinhaImportada[]) {
    setImportando(true)
    const res = await onImportar(linhas)
    setResultado(res)
    setImportando(false)
    setEtapa('resultado')
  }

  const colunasPrevia = modoImportacao === 'sistema_antigo'
    ? [
      { chave: 'etapa', rotulo: 'Etapa' },
      { chave: 'subetapa', rotulo: 'Subetapa' },
      { chave: 'codigo', rotulo: 'Codigo' },
      { chave: 'descricao', rotulo: 'Composicao' },
      { chave: 'quantidade', rotulo: 'Qtd. comp.' },
      { chave: 'insumos', rotulo: 'Insumos' },
    ]
    : config.colunas

  return (
    <Modal open={open} onClose={fechar} title="Importar/exportar orçamento" size="lg">
      <div className="flex flex-col gap-5">
        {etapa === 'opcoes' && (
          <>
            <div className="card p-5 flex flex-col gap-3" style={{ background: 'var(--bg-secondary)' }}>
              <div className="flex items-start gap-3">
                <Download size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>1. Baixe o modelo ou exporte o orçamento atual</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{config.descricaoModelo}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} onClick={() => baixarModeloXLSX(config)}>
                  Baixar modelo em branco (.xlsx)
                </Button>
                {linhasAtuais.length > 0 && (
                  <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={() => exportarOrcamentoTabularXLSX(linhasAtuais, obraName, versao)}>
                    Exportar orçamento atual (tabular)
                  </Button>
                )}
              </div>
            </div>

            <div className="card p-5 flex flex-col gap-3" style={{ background: 'var(--bg-secondary)' }}>
              <div className="flex items-start gap-3">
                <Upload size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>2. Preencha e importe de volta</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{config.descricaoImportacao}</p>
                </div>
              </div>
              <Button size="sm" icon={<ArrowRight size={14} />} onClick={() => { setModoImportacao('tabular'); setEtapa('upload') }} className="self-start">
                Importar planilha preenchida
              </Button>
            </div>

            <div className="card p-5 flex flex-col gap-3" style={{ background: 'var(--bg-secondary)' }}>
              <div className="flex items-start gap-3">
                <Database size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>3. Importar do sistema antigo</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Use a planilha exportada com a aba Dados Brutos. O sistema importa as composicoes e preserva a quantidade adotada dos insumos ja ajustada no orcamento.
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" icon={<ArrowRight size={14} />} onClick={() => { setModoImportacao('sistema_antigo'); setEtapa('upload') }} className="self-start">
                Importar planilha antiga
              </Button>
            </div>
          </>
        )}

        {etapa === 'upload' && (
          <div className="flex flex-col gap-4">
            <label
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all hover:opacity-80"
              style={{ borderColor: 'var(--border)' }}
            >
              {lendo ? (
                <>
                  <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Lendo planilha...</p>
                </>
              ) : (
                <>
                  <Upload size={28} style={{ color: 'var(--text-secondary)' }} />
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Arraste o arquivo XLSX preenchido ou clique para selecionar
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {modoImportacao === 'sistema_antigo'
                        ? 'Use o arquivo exportado do sistema antigo, com a aba Dados Brutos.'
                        : 'Use o modelo baixado na etapa anterior - nao altere os cabecalhos.'}
                    </p>
                  </div>
                </>
              )}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />
            </label>
            <Button variant="ghost" size="sm" onClick={() => setEtapa('opcoes')}>Voltar</Button>
          </div>
        )}

        {etapa === 'previa' && leitura && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Prévia — {leitura.linhas.length.toLocaleString('pt-BR')} {leitura.linhas.length === 1 ? 'item detectado' : 'itens detectados'}
                </h3>
                {arquivo && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{arquivo.name}</p>}
              </div>
              {leitura.linhas.length > 0 && (
                <Button size="sm" loading={importando} icon={<Database size={14} />} onClick={() => confirmarImportacao(leitura.linhas)}>
                  Importar {leitura.linhas.length.toLocaleString('pt-BR')} {leitura.linhas.length === 1 ? 'item' : 'itens'}
                </Button>
              )}
            </div>

            {leitura.linhas.length > 0 && (
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {colunasPrevia.map(c => (
                        <th key={c.chave} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{c.rotulo}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leitura.linhas.slice(0, 10).map(l => (
                      <tr key={l.numero} style={{ borderTop: '1px solid var(--border)' }}>
                        {colunasPrevia.map(c => (
                          <td key={c.chave} className="px-3 py-2 max-w-[220px] truncate" style={{ color: 'var(--text-primary)' }}>
                            {c.chave === 'insumos'
                              ? `${Array.isArray(l.valores.insumos) ? l.valores.insumos.length : 0} insumos`
                              : String(l.valores[c.chave] ?? '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {leitura.linhas.length > 10 && (
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td colSpan={colunasPrevia.length} className="px-3 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                          + {(leitura.linhas.length - 10).toLocaleString('pt-BR')} itens adicionais
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {leitura.erros.length > 0 && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                <p className="font-medium mb-1 flex items-center gap-1.5"><AlertTriangle size={14} /> {leitura.erros.length} linha(s) com erro de formato — não serão importadas:</p>
                {leitura.erros.slice(0, 6).map((e, i) => <p key={i}>{e}</p>)}
                {leitura.erros.length > 6 && <p>+ {leitura.erros.length - 6} erros adicionais...</p>}
              </div>
            )}

            {leitura.linhas.length === 0 && leitura.erros.length === 0 && (
              <div className="p-4 rounded-lg text-sm text-center" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                Nenhum item encontrado na planilha. Confira se os dados foram preenchidos abaixo da linha de cabeçalho.
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => { setEtapa('upload'); setArquivo(null); setLeitura(null) }} disabled={importando}>
              Escolher outro arquivo
            </Button>
          </div>
        )}

        {etapa === 'resultado' && resultado && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: resultado.erros.length === 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}>
              <CheckCircle2 size={22} style={{ color: resultado.erros.length === 0 ? 'var(--success)' : 'var(--warning)' }} />
              <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                <strong>{resultado.inseridos}</strong> {resultado.inseridos === 1 ? 'item adicionado' : 'itens adicionados'} ao orçamento.
                {resultado.ignorados > 0 && <span> {resultado.ignorados} linha(s) ignorada(s).</span>}
              </div>
            </div>
            {resultado.erros.length > 0 && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                {resultado.erros.slice(0, 8).map((e, i) => <p key={i}>{e}</p>)}
                {resultado.erros.length > 8 && <p>+ {resultado.erros.length - 8} erros adicionais...</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={reiniciar}>Importar outra planilha</Button>
              <Button size="sm" onClick={fechar}>Concluir</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
