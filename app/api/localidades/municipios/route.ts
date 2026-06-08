import { NextRequest, NextResponse } from 'next/server'

const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados'

export async function GET(req: NextRequest) {
  const uf = req.nextUrl.searchParams.get('uf')?.trim().toUpperCase()
  if (!uf || !/^[A-Z]{2}$/.test(uf)) {
    return NextResponse.json({ cidades: [] })
  }

  try {
    const res = await fetch(`${IBGE_URL}/${uf}/municipios?orderBy=nome`, {
      next: { revalidate: 3600 * 24 * 7 },
    })
    if (!res.ok) throw new Error('Falha ao consultar municipios')
    const data = await res.json()
    const cidades = Array.isArray(data)
      ? data.map((item: { nome?: string }) => item.nome).filter(Boolean)
      : []
    return NextResponse.json({ cidades })
  } catch (error) {
    console.error('Municipios IBGE error:', error)
    return NextResponse.json({ cidades: [] }, { status: 200 })
  }
}
