'use client'

// Telas que ainda NÃO têm módulo real por trás.
//
// Tempo é placeholder por decisão explícita: Tarefas já existe e funciona no
// BuildSmart, e transformá-lo em "Tempo" é convergência de produto — não se
// implementa uma segunda implementação concorrente aqui só para preencher a
// aba.

function Selo({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/15 bg-cyan-300/8 px-2.5 py-1 text-[11px] text-cyan-100/70">
      <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_currentColor]" />
      {texto}
    </span>
  )
}

function Bloco({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
      {children}
    </div>
  )
}

export function TelaTempo() {
  return (
    <div className="flex flex-col gap-4">
      <Selo texto="Ainda não migrado" />
      <p className="max-w-prose text-[14px] leading-relaxed text-white/70">
        O <strong className="font-semibold text-white/90">Tempo</strong> ainda não
        existe como módulo. O BuildSmart já tem <strong className="font-semibold text-white/90">Tarefas</strong>,
        e a decisão de convergir os dois — em vez de manter duas
        funcionalidades concorrentes — fica para uma etapa própria. Até lá esta
        aba mostra só o formato pretendido.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {['Hoje', 'Semana', 'Mês'].map(t => (
          <Bloco key={t}>
            <div className="text-[12px] uppercase tracking-[0.12em] text-cyan-200/55">{t}</div>
            <div className="mt-2 h-16 rounded-lg bg-[linear-gradient(120deg,rgba(90,160,255,0.14),rgba(120,90,255,0.10))]" />
          </Bloco>
        ))}
      </div>
      <Bloco>
        <div className="text-[12px] uppercase tracking-[0.12em] text-cyan-200/55">Linha do tempo</div>
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-cyan-300/70" />
              <div className="h-2 flex-1 rounded-full bg-white/8" style={{ maxWidth: `${80 - i * 18}%` }} />
            </div>
          ))}
        </div>
      </Bloco>
    </div>
  )
}

// Placeholder genérico para as abas do menu global que ainda não têm módulo
// migrado (Config global).
export function TelaPlaceholder({ nome }: { nome: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Selo texto="Ainda não migrado" />
      <p className="max-w-prose text-[14px] leading-relaxed text-white/70">
        <strong className="font-semibold text-white/90">{nome}</strong> ainda não
        foi migrado para a nova experiência. Dentro de um Processo, Config já
        controla os módulos reais.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl border border-white/8 bg-white/[0.03]" />
        ))}
      </div>
    </div>
  )
}
