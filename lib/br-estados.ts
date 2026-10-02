// Grade esquemática dos estados do Brasil (tilegram) para o "Mapa de operações".
// Não é um choropleth de SVG geográfico — é uma grade de blocos posicionados de
// forma aproximadamente geográfica (N→S, O→L), legível no celular e sem risco de
// um SVG de 27 paths malformado. Cada estado vira um bloco colorido por status.
// Dá para trocar por um GeoJSON real depois sem mudar os widgets (só a fonte das
// posições).

export const BR_ESTADOS_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
}

// [linha, coluna] numa grade de 7 colunas. Aproximação geográfica.
export const BR_TILEGRAM: Record<string, [number, number]> = {
  RR: [0, 2], AP: [0, 4],
  AM: [1, 1], PA: [1, 2], MA: [1, 3], CE: [1, 4], RN: [1, 5],
  AC: [2, 0], RO: [2, 1], TO: [2, 2], PI: [2, 3], PB: [2, 5], PE: [2, 4],
  MT: [3, 1], GO: [3, 2], BA: [3, 3], AL: [3, 5], SE: [3, 4],
  MS: [4, 1], DF: [4, 2], MG: [4, 3], ES: [4, 4],
  SP: [5, 2], RJ: [5, 3],
  PR: [6, 2],
  SC: [7, 2],
  RS: [8, 2],
}

export const BR_TILEGRAM_LINHAS = 9
export const BR_TILEGRAM_COLUNAS = 7
