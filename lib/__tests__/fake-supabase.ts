// Cliente Supabase falso, em memória, só com o subconjunto de operações que
// lib/tarefas-ai-tools.ts e lib/luizia-pending-actions.ts realmente usam.
// Objetivo: testar a lógica de autorização/resolução sem rede (o sandbox
// bloqueia acesso direto a *.supabase.co) e sem tocar produção.

type Row = Record<string, any>
type Table = Row[]

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

const DIACRITICOS_FAKE = new RegExp(String.fromCharCode(91) + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + String.fromCharCode(93), 'g')
function normalizarFake(s: string): string {
  return (s || '').normalize('NFD').replace(DIACRITICOS_FAKE, '').toLowerCase()
}

class FakeQuery implements PromiseLike<{ data: Row[] | Row | null; error: null | { message: string } }> {
  private filters: ((r: Row) => boolean)[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | null = null
  private singleMode: 'one' | 'maybe' | null = null

  constructor(private db: FakeDB, private table: string) {}

  select(_cols?: string) { return this }
  insert(payload: Row) { this.mode = 'insert'; this.payload = payload; return this }
  update(payload: Row) { this.mode = 'update'; this.payload = payload; return this }
  delete() { this.mode = 'delete'; return this }

  eq(col: string, val: any) { this.filters.push(r => getPath(r, col) === val); return this }
  in(col: string, vals: any[]) { this.filters.push(r => vals.includes(getPath(r, col))); return this }
  ilike(col: string, pattern: string) {
    const alvo = normalizarFake(pattern.replace(/^%|%$/g, ''))
    this.filters.push(r => normalizarFake(String(getPath(r, col) ?? '')).includes(alvo))
    return this
  }
  lte(col: string, val: any) { this.filters.push(r => getPath(r, col) != null && getPath(r, col) <= val); return this }
  lt(col: string, val: any) { this.filters.push(r => getPath(r, col) != null && getPath(r, col) < val); return this }
  gte(col: string, val: any) { this.filters.push(r => getPath(r, col) != null && getPath(r, col) >= val); return this }
  gt(col: string, val: any) { this.filters.push(r => getPath(r, col) != null && getPath(r, col) > val); return this }
  not(col: string, _op: string, _val: any) { this.filters.push(r => getPath(r, col) != null); return this }
  order(col: string, _opts?: { ascending?: boolean; nullsFirst?: boolean }) { this.orderCol = col; this.orderAsc = _opts?.ascending !== false; return this }
  limit(n: number) { this.limitN = n; return this }
  maybeSingle() { this.singleMode = 'maybe'; return this }
  single() { this.singleMode = 'one'; return this }

  private run(): { data: Row[] | Row | null; error: null | { message: string } } {
    const table = this.db.tables[this.table] || (this.db.tables[this.table] = [])

    if (this.mode === 'insert') {
      const row: Row = { id: this.db.nextId(), created_at: new Date().toISOString(), ...this.payload }
      table.push(row)
      if (this.singleMode) return { data: row, error: null }
      return { data: [row], error: null }
    }

    let rows = table.filter(r => this.filters.every(f => f(r)))

    if (this.mode === 'update') {
      for (const r of rows) Object.assign(r, this.payload)
      return { data: null, error: null }
    }
    if (this.mode === 'delete') {
      this.db.tables[this.table] = table.filter(r => !rows.includes(r))
      return { data: null, error: null }
    }

    if (this.orderCol) {
      rows = [...rows].sort((a, b) => {
        const av = getPath(a, this.orderCol!)
        const bv = getPath(b, this.orderCol!)
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return this.orderAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
      })
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN)

    if (this.singleMode === 'one') return { data: rows[0] || null, error: rows[0] ? null : { message: 'not found' } }
    if (this.singleMode === 'maybe') return { data: rows[0] || null, error: null }
    return { data: rows, error: null }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: null | { message: string } }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

export class FakeDB {
  tables: Record<string, Table> = {}
  private idCounter = 1
  nextId() { return `fake-${this.idCounter++}` }
  from(table: string) { return new FakeQuery(this, table) }
  seed(table: string, rows: Row[]) { this.tables[table] = rows.map(r => ({ ...r })) }

  // Suporte mínimo a RPC — só o suficiente para simular
  // prospeccao_cenario_definir_principal (lib/investidor-ai-tools.ts) em
  // teste, sem rede. Ver RELATORIO_INVESTIDOR_RODADA_06.md.
  rpc(fnName: string, params: Record<string, any>): PromiseLike<{ data: null; error: null | { message: string } }> {
    if (fnName === 'prospeccao_cenario_definir_principal') {
      const cenarios = this.tables['prospeccao_cenarios'] || []
      for (const c of cenarios) {
        if (c.prospeccao_id === params.p_prospeccao_id) c.principal = c.id === params.p_cenario_id
      }
      return Promise.resolve({ data: null, error: null })
    }
    return Promise.resolve({ data: null, error: { message: `rpc ${fnName} não simulada no fake` } })
  }
}
