import type { SupabaseClient } from '@supabase/supabase-js'
import { composicaoPadrao, WIDGET_POR_KEY, type DashboardModulo, type WidgetKey } from './widgets-registry'

// Preferências da Visão Geral por usuário + organização + módulo: ordem dos
// widgets e quais estão ocultos. Persistência em dois níveis:
//   1. localStorage (sempre) — vale na hora, por dispositivo, sem depender do banco;
//   2. tabela dashboard_preferencias (quando existir) — cross-device, por
//      usuário+org. Enquanto a migration não é aplicada, o upsert falha em
//      silêncio e ficamos só no localStorage. Quando for aplicada, passa a
//      sincronizar sozinho. Nada quebra nos dois caminhos.

export type DashboardPrefs = {
  ordem: WidgetKey[]
  ocultos: WidgetKey[]
}

const TABELA = 'dashboard_preferencias'

function chaveLocal(profileId: string | null, orgId: string | null, modulo: DashboardModulo) {
  return `buildsmart-visaogeral:${orgId ?? 'org'}:${profileId ?? 'me'}:${modulo}`
}

// Normaliza prefs contra o registry atual: remove widgets que não existem mais,
// acrescenta no fim os que surgiram depois (composição evolui sem apagar escolha).
export function resolverComposicao(modulo: DashboardModulo, prefs: DashboardPrefs | null): WidgetKey[] {
  const padrao = composicaoPadrao(modulo)
  if (!prefs) return padrao
  const validos = prefs.ordem.filter(k => WIDGET_POR_KEY[k] && composicaoPadrao(modulo).includes(k))
  const faltando = padrao.filter(k => !validos.includes(k))
  const ordem = [...validos, ...faltando]
  return ordem.filter(k => !prefs.ocultos.includes(k))
}

function lerLocal(chave: string): DashboardPrefs | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(chave)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<DashboardPrefs>
    return { ordem: Array.isArray(p.ordem) ? p.ordem : [], ocultos: Array.isArray(p.ocultos) ? p.ocultos : [] }
  } catch {
    return null
  }
}

function escreverLocal(chave: string, prefs: DashboardPrefs) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(chave, JSON.stringify(prefs)) } catch { /* cota/privado: ignora */ }
}

export async function carregarPrefs(
  supabase: SupabaseClient,
  ctx: { profileId: string | null; orgId: string | null; modulo: DashboardModulo },
): Promise<DashboardPrefs | null> {
  const chave = chaveLocal(ctx.profileId, ctx.orgId, ctx.modulo)
  // Banco primeiro (fonte cross-device); cai no localStorage se a tabela ainda
  // não existe ou não há linha.
  if (ctx.profileId) {
    try {
      const { data, error } = await supabase
        .from(TABELA)
        .select('ordem,ocultos')
        .eq('profile_id', ctx.profileId)
        .eq('modulo', ctx.modulo)
        .maybeSingle()
      if (!error && data) {
        const prefs = {
          ordem: (data.ordem ?? []) as WidgetKey[],
          ocultos: (data.ocultos ?? []) as WidgetKey[],
        }
        escreverLocal(chave, prefs)
        return prefs
      }
    } catch { /* tabela inexistente (pré-migration) → localStorage */ }
  }
  return lerLocal(chave)
}

export async function salvarPrefs(
  supabase: SupabaseClient,
  ctx: { profileId: string | null; orgId: string | null; modulo: DashboardModulo },
  prefs: DashboardPrefs,
): Promise<void> {
  escreverLocal(chaveLocal(ctx.profileId, ctx.orgId, ctx.modulo), prefs)
  if (!ctx.profileId) return
  try {
    await supabase.from(TABELA).upsert(
      {
        profile_id: ctx.profileId,
        organization_id: ctx.orgId,
        modulo: ctx.modulo,
        ordem: prefs.ordem,
        ocultos: prefs.ocultos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,modulo' },
    )
  } catch { /* pré-migration: fica só no localStorage, atualiza quando a tabela existir */ }
}
