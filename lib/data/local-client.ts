import { createLocalSeed, LocalDatabase, LOCAL_DB_VERSION } from './local-seed'

type TableName = keyof LocalDatabase
type Row = Record<string, any>
type Filter = { type: 'eq' | 'neq' | 'gte' | 'is' | 'in' | 'ilike'; field: string; value: any }

const STORAGE_KEY = 'buildsmart-local-db'
const LOG_KEY = 'buildsmart-local-log'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function nowIso() {
  return new Date().toISOString()
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function localLog(message: string) {
  if (!isBrowser()) return
  const current = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
  current.push({ at: nowIso(), message })
  localStorage.setItem(LOG_KEY, JSON.stringify(current.slice(-200)))
}

function initialState() {
  return { version: LOCAL_DB_VERSION, data: createLocalSeed() }
}

function readDb(): LocalDatabase {
  if (!isBrowser()) return createLocalSeed()
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const state = initialState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    localStorage.setItem(LOG_KEY, JSON.stringify([{ at: nowIso(), message: 'Base local zerada e seed de exemplo criado.' }]))
    return clone(state.data)
  }

  try {
    const parsed = JSON.parse(raw)
    if (parsed.version !== LOCAL_DB_VERSION) {
      const state = initialState()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      localLog(`Versao local mudou para ${LOCAL_DB_VERSION}; base local recriada.`)
      return clone(state.data)
    }
    return clone(parsed.data)
  } catch {
    const state = initialState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    localLog('Base local invalida foi descartada e recriada.')
    return clone(state.data)
  }
}

function writeDb(data: LocalDatabase, message: string) {
  if (!isBrowser()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: LOCAL_DB_VERSION, data }))
  localLog(message)
}

function getField(row: Row, field: string) {
  return field.split('.').reduce((acc, key) => acc?.[key], row)
}

function applyFilters(rows: Row[], filters: Filter[]) {
  return rows.filter(row => filters.every(filter => {
    const actual = getField(row, filter.field)
    if (filter.type === 'eq') return actual === filter.value
    if (filter.type === 'neq') return actual !== filter.value
    if (filter.type === 'gte') return actual >= filter.value
    if (filter.type === 'is') return actual === filter.value
    if (filter.type === 'in') return Array.isArray(filter.value) && filter.value.includes(actual)
    if (filter.type === 'ilike') {
      const needle = String(filter.value).replace(/%/g, '').toLowerCase()
      return String(actual || '').toLowerCase().includes(needle)
    }
    return true
  }))
}

function sortRows(rows: Row[], field?: string, ascending = true) {
  if (!field) return rows
  return [...rows].sort((a, b) => {
    const av = getField(a, field)
    const bv = getField(b, field)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true }) * (ascending ? 1 : -1)
  })
}

function costForComposition(db: LocalDatabase, composicaoId: string, uf = 'SP') {
  return db.composicao_insumos
    .filter(item => item.composicao_id === composicaoId)
    .reduce((total, item) => {
      const insumo = db.sinapi_insumos.find(i => i.id === item.insumo_id)
      const proprio = db.insumos_proprios.find(i => i.id === item.insumo_proprio_id)
      const preco = insumo?.precos?.[uf] ?? proprio?.preco_unitario ?? 0
      return total + item.coeficiente * preco
    }, 0)
}

function enrichRow(db: LocalDatabase, table: TableName, row: Row): Row {
  const item = clone(row)

  if (table === 'etapas') {
    item.obras = db.obras.find(o => o.id === item.obra_id) || null
  }

  if (table === 'materiais') {
    item.obras = db.obras.find(o => o.id === item.obra_id) || null
    item.etapas = db.etapas.find(e => e.id === item.etapa_id) || null
    item.sinapi_insumos = db.sinapi_insumos.find(i => i.codigo === item.sinapi_codigo) || {
      codigo: item.sinapi_codigo,
      descricao: item.descricao,
      unidade: item.unidade,
    }
  }

  if (table === 'fornecedores') {
    item.obras = item.obra_id ? db.obras.find(o => o.id === item.obra_id) || null : null
  }

  if (table === 'medicoes') {
    item.obras = db.obras.find(o => o.id === item.obra_id) || null
    item.etapas = db.etapas.find(e => e.id === item.etapa_id) || null
    item.data_medicao = item.created_at
  }

  if (table === 'orcamentos') {
    item.obra = db.obras.find(o => o.id === item.obra_id) || null
    item.obras = item.obra
    item.orcamento_itens = db.orcamento_itens.filter(i => i.orcamento_id === item.id)
  }

  if (table === 'orcamento_itens') {
    const composicao = db.composicoes_proprias.find(c => c.id === item.composicao_id) || null
    const sinapi = db.sinapi_composicoes.find(c => c.id === item.sinapi_composicao_id) || null
    item.composicoes_proprias = composicao ? enrichRow(db, 'composicoes_proprias', composicao) : null
    item.sinapi_composicoes = sinapi
  }

  if (table === 'composicoes_proprias') {
    item.composicao_insumos = db.composicao_insumos
      .filter(ci => ci.composicao_id === item.id)
      .map(ci => enrichRow(db, 'composicao_insumos', ci))
    item.custo_calculado = costForComposition(db, item.id)
  }

  if (table === 'composicao_insumos') {
    item.insumo = db.sinapi_insumos.find(i => i.id === item.insumo_id) || null
    item.sinapi_insumos = item.insumo
    item.insumo_proprio = db.insumos_proprios.find(i => i.id === item.insumo_proprio_id) || null
  }

  return item
}

class LocalQuery {
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: Filter[] = []
  private orderField?: string
  private ascending = true
  private limitCount?: number
  private orExpression?: string
  private payload: any
  private wantsSingle = false
  private wantsMaybeSingle = false
  private wantsCount = false
  private wantsHead = false
  private returning = false

  constructor(private table: TableName) {}

  select(_columns = '*', options?: { count?: string; head?: boolean }) {
    if (this.operation !== 'insert' && this.operation !== 'update' && this.operation !== 'upsert') {
      this.operation = 'select'
    }
    this.returning = true
    this.wantsCount = Boolean(options?.count)
    this.wantsHead = Boolean(options?.head)
    return this
  }

  insert(payload: any) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  upsert(payload: any) {
    this.operation = 'upsert'
    this.payload = payload
    return this
  }

  update(payload: any) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(field: string, value: any) { this.filters.push({ type: 'eq', field, value }); return this }
  neq(field: string, value: any) { this.filters.push({ type: 'neq', field, value }); return this }
  gte(field: string, value: any) { this.filters.push({ type: 'gte', field, value }); return this }
  is(field: string, value: any) { this.filters.push({ type: 'is', field, value }); return this }
  in(field: string, value: any[]) { this.filters.push({ type: 'in', field, value }); return this }
  ilike(field: string, value: string) { this.filters.push({ type: 'ilike', field, value }); return this }

  or(expression: string) {
    this.orExpression = expression
    return this
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderField = field
    this.ascending = options?.ascending ?? true
    return this
  }

  limit(count: number) {
    this.limitCount = count
    return this
  }

  single() {
    this.wantsSingle = true
    return this
  }

  maybeSingle() {
    this.wantsMaybeSingle = true
    return this
  }

  then(resolve: (value: any) => void, reject: (reason?: any) => void) {
    this.execute().then(resolve, reject)
  }

  private async execute() {
    const db = readDb()
    const tableRows = db[this.table] as Row[]
    let data: any = null

    if (this.operation === 'select') {
      let rows = applyFilters(tableRows.map(row => enrichRow(db, this.table, row)), this.filters)
      rows = this.applyOr(rows)
      rows = sortRows(rows, this.orderField, this.ascending)
      if (this.limitCount !== undefined) rows = rows.slice(0, this.limitCount)
      data = this.wantsHead ? null : rows
      return this.format(data, null, rows.length)
    }

    if (this.operation === 'insert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row: Row) => ({
        id: row.id || id(String(this.table)),
        created_at: row.created_at || nowIso(),
        updated_at: row.updated_at || nowIso(),
        ...row,
      }))
      ;(db[this.table] as Row[]).push(...rows)
      writeDb(db, `Insert em ${this.table}: ${rows.length} registro(s).`)
      data = rows.map(row => enrichRow(db, this.table, row))
      return this.format(this.returning ? data : null, null, data.length)
    }

    if (this.operation === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
      const target = db[this.table] as Row[]
      const saved = rows.map((row: Row) => {
        const index = target.findIndex(existing =>
          (row.id && existing.id === row.id) ||
          (row.codigo && row.mes_referencia && existing.codigo === row.codigo && existing.mes_referencia === row.mes_referencia) ||
          (row.codigo && existing.codigo === row.codigo)
        )
        if (index >= 0) {
          target[index] = { ...target[index], ...row, updated_at: nowIso() }
          return target[index]
        }
        const created = { id: row.id || id(String(this.table)), created_at: nowIso(), updated_at: nowIso(), ...row }
        target.push(created)
        return created
      })
      writeDb(db, `Upsert em ${this.table}: ${saved.length} registro(s).`)
      data = saved.map(row => enrichRow(db, this.table, row))
      return this.format(this.returning ? data : null, null, data.length)
    }

    if (this.operation === 'update') {
      const target = db[this.table] as Row[]
      const updated: Row[] = []
      target.forEach((row, index) => {
        if (applyFilters([row], this.filters).length > 0) {
          target[index] = { ...row, ...this.payload, updated_at: nowIso() }
          updated.push(target[index])
        }
      })
      writeDb(db, `Update em ${this.table}: ${updated.length} registro(s).`)
      data = updated.map(row => enrichRow(db, this.table, row))
      return this.format(this.returning ? data : null, null, updated.length)
    }

    if (this.operation === 'delete') {
      const target = db[this.table] as Row[]
      const kept = target.filter(row => applyFilters([row], this.filters).length === 0)
      const removed = target.length - kept.length
      ;(db[this.table] as Row[]) = kept as any
      writeDb(db, `Delete em ${this.table}: ${removed} registro(s).`)
      return this.format(null, null, removed)
    }

    return this.format(null, null, 0)
  }

  private format(data: any, error: any, count: number) {
    if (this.wantsSingle) return { data: Array.isArray(data) ? data[0] || null : data, error, count }
    if (this.wantsMaybeSingle) return { data: Array.isArray(data) ? data[0] || null : data, error, count }
    return { data, error, count }
  }

  private applyOr(rows: Row[]) {
    if (!this.orExpression) return rows
    const clauses = this.orExpression.split(',').map(clause => {
      const [field, op, rawValue] = clause.split('.')
      return { field, op, value: rawValue?.replace(/%/g, '').toLowerCase() || '' }
    })
    return rows.filter(row => clauses.some(clause => {
      if (clause.op !== 'ilike') return false
      return String(getField(row, clause.field) || '').toLowerCase().includes(clause.value)
    }))
  }
}

export function createLocalClient() {
  return {
    from(table: TableName) {
      return new LocalQuery(table)
    },
    local: {
      reset() {
        const state = initialState()
        if (isBrowser()) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
          localStorage.setItem(LOG_KEY, JSON.stringify([{ at: nowIso(), message: 'Reset manual: base local zerada e seed recriado.' }]))
        }
        return state.data
      },
      getLog() {
        if (!isBrowser()) return []
        return JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
      },
    },
  }
}

export function isLocalDataMode() {
  return process.env.NEXT_PUBLIC_DATA_MODE !== 'supabase'
}
