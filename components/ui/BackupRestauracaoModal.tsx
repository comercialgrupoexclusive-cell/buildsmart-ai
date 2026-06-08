'use client'

import { useState } from 'react'
import { Download, Upload, AlertTriangle, CheckCircle2, Loader2, ShieldAlert, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  ROTULOS_TABELA, ResumoTabela, ArquivoBackup, ResultadoRestauracao, ProgressoRestauracao,
  gerarBackupCompleto, baixarBackupJSON, lerArquivoBackup, restaurarBackup,
} from '@/lib/backup-sistema'

type Props = {
  open: boolean
  onClose: () => void
}

type Etapa = 'opcoes' | 'gerando' | 'upload' | 'previa' | 'confirmar' | 'restaurando' | 'resultado'

const CONFIRMACAO_ESPERADA = 'RESTAURAR'

export function BackupRestauracaoModal({ open, onClose }: Props) {
  const supabase = createClient()
  const [etapa, setEtapa] = useState<Etapa>('opcoes')
  const [gerandoBackup, setGerandoBackup] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [backupLido, setBackupLido] = useState<{ arquivo: ArquivoBackup; resumo: ResumoTabela[] } | null>(null)
  const [textoConfirmacao, setTextoConfirmacao] = useState('')
  const [progresso, setProgresso] = useState<ProgressoRestauracao | null>(null)
  const [resultado, setResultado] = useState<ResultadoRestauracao | null>(null)

  function reiniciar() {
    setEtapa('opcoes')
    setArquivo(null)
    setErroLeitura(null)
    setBackupLido(null)
    setTextoConfirmacao('')
    setProgresso(null)
    setResultado(null)
  }

  function fechar() {
    if (etapa === 'gerando' || etapa === 'restaurando') return
    reiniciar()
    onClose()
  }

  async function handleBaixarBackup() {
    setGerandoBackup(true)
    try {
      const { arquivo } = await gerarBackupCompleto(supabase)
      baixarBackupJSON(arquivo)
    } finally {
      setGerandoBackup(false)
    }
  }

  async function handleArquivo(f: File) {
    setArquivo(f)
    setLendo(true)
    setErroLeitura(null)
    setBackupLido(null)
    const leitura = await lerArquivoBackup(f)
    if (leitura.valido) {
      setBackupLido({ arquivo: leitura.arquivo, resumo: leitura.resumo })
      setEtapa('previa')
    } else {
      setErroLeitura(leitura.erro)
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

  async function handleRestaurar() {
    if (!backupLido) return
    setEtapa('restaurando')
    setProgresso(null)
    const res = await restaurarBackup(supabase, backupLido.arquivo, p => setProgresso(p))
    setResultado(res)
    setEtapa('resultado')
  }

  const totalRegistrosBackup = backupLido?.resumo.reduce((acc, r) => acc + r.quantidade, 0) ?? 0

  return (
    <Modal open={open} onClose={fechar} title="Backup e restauração do sistema" size="lg">
      <div className="flex flex-col gap-5">
        {etapa === 'opcoes' && (
          <>
            <div className="card p-5 flex flex-col gap-3" style={{ background: 'var(--bg-secondary)' }}>
              <div className="flex items-start gap-3">
                <Download size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Baixar backup completo</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Gera um arquivo .json com todos os dados do sistema (obras, orçamentos, composições, insumos, fornecedores, perfis e mais). Guarde-o em local seguro.
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" loading={gerandoBackup} icon={<Download size={14} />} onClick={handleBaixarBackup} className="self-start">
                Baixar backup (.json)
              </Button>
            </div>

            <div className="card p-5 flex flex-col gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <div className="flex items-start gap-3">
                <ShieldAlert size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Restaurar backup</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Importa um arquivo de backup gerado pelo BuildSmart AI. <strong>Atenção:</strong> isso substitui TODOS os dados atuais do sistema pelos dados do arquivo — a operação não pode ser desfeita.
                  </p>
                </div>
              </div>
              <Button variant="danger" size="sm" icon={<ArrowRight size={14} />} onClick={() => setEtapa('upload')} className="self-start">
                Selecionar arquivo de backup
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
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Lendo arquivo de backup...</p>
                </>
              ) : (
                <>
                  <Upload size={28} style={{ color: 'var(--text-secondary)' }} />
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Arraste o arquivo de backup (.json) ou clique para selecionar
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Apenas arquivos gerados pela opção &quot;Baixar backup&quot; do BuildSmart AI
                    </p>
                  </div>
                </>
              )}
              <input type="file" accept=".json,application/json" className="hidden" onChange={handleChange} />
            </label>
            {erroLeitura && (
              <div className="p-3 rounded-lg text-xs flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {erroLeitura}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => { setEtapa('opcoes'); setArquivo(null); setErroLeitura(null) }}>Voltar</Button>
          </div>
        )}

        {etapa === 'previa' && backupLido && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Conteúdo do arquivo de backup</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {arquivo?.name} — gerado em {new Date(backupLido.arquivo.gerado_em).toLocaleString('pt-BR')} (v{backupLido.arquivo.versao_app}) — {totalRegistrosBackup.toLocaleString('pt-BR')} registros no total
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Tabela</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {backupLido.resumo.map(r => (
                    <tr key={r.tabela} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{ROTULOS_TABELA[r.tabela]}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{r.quantidade.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEtapa('upload'); setArquivo(null); setBackupLido(null) }}>Escolher outro arquivo</Button>
              <Button variant="danger" size="sm" icon={<ShieldAlert size={14} />} onClick={() => setEtapa('confirmar')}>Continuar para restauração</Button>
            </div>
          </div>
        )}

        {etapa === 'confirmar' && backupLido && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-lg flex flex-col gap-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Esta ação é irreversível</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Ao continuar, <strong>todos os dados atuais do sistema serão apagados</strong> e substituídos pelos {totalRegistrosBackup.toLocaleString('pt-BR')} registros do arquivo selecionado
                ({arquivo?.name}, gerado em {new Date(backupLido.arquivo.gerado_em).toLocaleString('pt-BR')}). Não há como desfazer esta operação depois de iniciada.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Se ainda não baixou um backup recente dos dados atuais, cancele e faça isso primeiro.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Para confirmar, digite <strong>{CONFIRMACAO_ESPERADA}</strong> no campo abaixo
              </label>
              <Input value={textoConfirmacao} onChange={e => setTextoConfirmacao(e.target.value)} placeholder={CONFIRMACAO_ESPERADA} />
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEtapa('previa'); setTextoConfirmacao('') }}>Voltar</Button>
              <Button variant="danger" size="sm" disabled={textoConfirmacao.trim().toUpperCase() !== CONFIRMACAO_ESPERADA} onClick={handleRestaurar}>
                Apagar dados atuais e restaurar backup
              </Button>
            </div>
          </div>
        )}

        {etapa === 'restaurando' && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--danger)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {progresso?.etapa === 'limpando' ? 'Limpando dados atuais...' : progresso?.etapa === 'restaurando' ? 'Restaurando backup...' : 'Preparando restauração...'}
            </p>
            {progresso && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {ROTULOS_TABELA[progresso.tabela]} ({progresso.indice}/{progresso.total})
              </p>
            )}
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Não feche ou recarregue esta página até a conclusão.</p>
          </div>
        )}

        {etapa === 'resultado' && resultado && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: resultado.erros.length === 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}>
              <CheckCircle2 size={22} style={{ color: resultado.erros.length === 0 ? 'var(--success)' : 'var(--warning)' }} />
              <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                Restauração concluída — <strong>{resultado.tabelasRestauradas}</strong> de {ROTULOS_TABELA && Object.keys(ROTULOS_TABELA).length} tabelas e <strong>{resultado.linhasRestauradas.toLocaleString('pt-BR')}</strong> registros restaurados.
                {resultado.erros.length > 0 && <span> {resultado.erros.length} erro(s) ocorreram durante o processo.</span>}
              </div>
            </div>
            {resultado.erros.length > 0 && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                {resultado.erros.slice(0, 8).map((e, i) => <p key={i}>{e}</p>)}
                {resultado.erros.length > 8 && <p>+ {resultado.erros.length - 8} erros adicionais...</p>}
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Recarregue a página para ver os dados restaurados em todas as telas.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>Recarregar agora</Button>
              <Button size="sm" onClick={fechar}>Fechar</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
