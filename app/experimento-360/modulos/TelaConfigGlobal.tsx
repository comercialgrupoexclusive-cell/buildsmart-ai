'use client'

import { useState } from 'react'

// Config do menu global — nesta etapa é só a saída da sessão. As demais
// configurações globais (tema, organização, etc.) continuam fora do escopo;
// Config dentro de um Processo já existe e trata dos módulos reais
// (ver TelaConfig.tsx).
//
// Mesmo par de chamadas do logout em components/layout/Header.tsx
// (handleSwitchProfile): POST /api/auth/logout encerra a sessão real no
// Supabase e limpa os cookies de sessão; a navegação completa para /login
// garante que nenhum estado de cliente da sessão anterior sobrevive.
export function TelaConfigGlobal() {
  const [saindo, setSaindo] = useState(false)
  const [erro, setErro] = useState('')

  async function sair() {
    setSaindo(true)
    setErro('')
    try {
      const resposta = await fetch('/api/auth/logout', { method: 'POST' })
      if (!resposta.ok) throw new Error()
      window.location.assign('/login')
    } catch {
      setErro('Não foi possível encerrar a sessão agora. Tente de novo.')
      setSaindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
        <div className="text-[12px] uppercase tracking-[0.12em] text-cyan-200/55">Sessão</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-white/60">
          Encerra sua sessão neste dispositivo e volta para a tela de login.
        </p>
        {erro && <p className="mt-2 text-[12.5px] text-red-300/85">{erro}</p>}
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          className="mt-3 rounded-full border border-red-300/25 bg-red-400/10 px-4 py-1.5 text-[13px] font-medium text-red-200 outline-none transition hover:bg-red-400/18 disabled:opacity-50"
        >
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </div>
    </div>
  )
}
