// Stub só para os testes (vitest): o pacote real 'server-only' é um guard de
// build do Next.js (fica vazio em runtime, só existe para o bundler acusar
// erro se um arquivo marcado assim for importado do client). Fora do Next,
// não há bundler nenhum resolvendo esse import — sem este stub, qualquer
// teste que importe lib/luizia-core.ts (que importa lib/luizia-tools.ts, que
// tem 'server-only' no topo) falha com "Cannot find package".
export {}
