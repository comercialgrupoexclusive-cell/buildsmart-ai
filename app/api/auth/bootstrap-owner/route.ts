import { NextResponse } from 'next/server'

function closed() {
  return NextResponse.json({ error: 'Fluxo desativado. Use o login global em /login. Cadastros são realizados por convite.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}
export const GET = closed
export const POST = closed
export const DELETE = closed
export const PATCH = closed
