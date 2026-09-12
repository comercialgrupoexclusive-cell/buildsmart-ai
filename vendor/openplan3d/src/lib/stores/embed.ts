// BuildSmart — modo embutido (módulo oficial Planta 2D/3D do Processo).
// `?embed=1` na URL do editor identifica que este documento está dentro do
// iframe same-origin do PlantaEditor.tsx, não sendo aberto standalone pelo
// usuário. Não é uma store reativa: o parâmetro não muda depois que a página
// carrega, então uma função pura evita qualquer estado extra/import
// circular entre os módulos que precisam checar isso (bridge.ts,
// saveStatus.ts, TopBar.svelte).
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('embed') === '1';
}
