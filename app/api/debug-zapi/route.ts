export async function GET() {
  return Response.json({ error: 'Diagnóstico público desativado.' }, { status: 410 })
}
export const POST = GET
