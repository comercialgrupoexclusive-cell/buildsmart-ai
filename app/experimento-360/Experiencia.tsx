'use client'

import { useEffect, useRef, useState } from 'react'
import { Orbe, type EstadoOrbe } from './Orbe'
import { CaixaConversa } from './CaixaConversa'

const MS_PENSANDO = 1800
const MS_RESPONDENDO = 3600

export function Experiencia() {
  const [estado, setEstado] = useState<EstadoOrbe>('repouso')
  const temporizadores = useRef<number[]>([])

  useEffect(() => () => temporizadores.current.forEach(clearTimeout), [])

  const enviar = () => {
    temporizadores.current.forEach(clearTimeout)
    setEstado('pensando')
    temporizadores.current = [
      window.setTimeout(() => setEstado('respondendo'), MS_PENSANDO),
      window.setTimeout(() => setEstado('repouso'), MS_PENSANDO + MS_RESPONDENDO),
    ]
  }

  return (
    <>
      <Orbe estado={estado} />
      <CaixaConversa estado={estado} onEnviar={enviar} />
    </>
  )
}
