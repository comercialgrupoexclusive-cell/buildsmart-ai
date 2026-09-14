export type Autor = 'voce' | 'orbe'

export type Mensagem = {
  id: number
  autor: Autor
  texto: string
}

export const SAUDACAO = 'Você chegou. O possível acabou de ganhar companhia.'

const SAUDACOES = [
  'oi', 'ola', 'opa', 'salve', 'eai', 'e ai', 'hey', 'hi', 'hello', 'alo',
  'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'tudo bom', 'como vai',
]

const IDEIAS = [
  'ideia', 'projeto', 'sonho', 'plano', 'criar', 'construir', 'fazer',
  'startup', 'app', 'aplicativo', 'sistema', 'produto', 'negocio', 'empresa',
  'obra', 'site', 'plataforma', 'ferramenta', 'inventar', 'lancar', 'montar',
]

const semAcento = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Casa a palavra inteira: sem isso "oi" dispararia dentro de "foi" e de
// "dois", e quase tudo viraria saudação.
const contem = (texto: string, termos: string[], comSufixo = false) =>
  termos.some(termo =>
    new RegExp(`(^|[^a-z0-9])${termo}${comSufixo ? '[a-z]*' : ''}([^a-z0-9]|$)`).test(texto),
  )

export function responderDemonstracao(entrada: string): string {
  const texto = semAcento(entrada)
  if (contem(texto, SAUDACOES)) return 'Oi. Qual ideia está fazendo barulho aí dentro?'
  if (contem(texto, IDEIAS, true)) {
    return 'Pode trazer ainda sem forma. Qual é a primeira coisa que você gostaria de tornar real?'
  }
  return 'Vamos começar por aí. Como seria isso funcionando do seu jeito?'
}

// Ritmo da revelação. Palavra maior demora um pouco mais, e a pontuação
// segura a frase — é o que dá cadência de fala aos pulsos do orbe.
export function ritmoDaPalavra(palavra: string) {
  const base = 105 + Math.min(palavra.length, 12) * 16
  const finalDeFrase = /[.!?…]$/.test(palavra)
  const pausaCurta = /[,;:]$/.test(palavra)
  return {
    atraso: base + (finalDeFrase ? 420 : pausaCurta ? 190 : 0),
    intensidade: Math.min(1, 0.35 + palavra.replace(/\W/g, '').length * 0.08 + (finalDeFrase ? 0.25 : 0)),
  }
}
