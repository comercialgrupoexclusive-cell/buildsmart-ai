'use client'

// A reação ao ponteiro é adaptada de sphere-particle-wrap, de Safar Isaev
// (https://github.com/SafarSoFar/sphere-particle-wrap), MIT © 2025 — de lá vem
// a ideia de projetar o cursor no plano do orbe e empurrar cada partícula por
// proximidade, voltando ao repouso por interpolação. A implementação aqui é
// outra: o original usa um Mesh por ponto e move tudo na CPU, o que não escala
// para dezenas de milhares de partículas; aqui é um único THREE.Points e o
// deslocamento acontece no vertex shader.

import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'

export type EstadoOrbe = 'repouso' | 'pensando' | 'respondendo'
export type OrbeHandle = { pulsar: (intensidade: number) => void }

const RAIO = 2.25
const MAX_ONDAS = 5
const VIDA_ONDA = 1.7
const VEL_ONDA = 2.6
const SEG_FORMACAO = 3.8

const vertexShader = /* glsl */ `
  uniform float uTempo;
  uniform float uEnergia;
  uniform float uExpansao;
  uniform float uOrbita;
  uniform float uFala;
  uniform vec3  uPonteiro;
  uniform float uForcaPonteiro;
  uniform float uRaioPonteiro;
  uniform float uEmpurrao;
  uniform vec3  uOndaOrigem[${MAX_ONDAS}];
  uniform float uOndaInicio[${MAX_ONDAS}];
  uniform float uOndaForca[${MAX_ONDAS}];
  uniform float uPixelRatio;
  uniform float uTamanho;
  uniform float uGanho;
  uniform float uFormacao;

  attribute vec3  aOrigem;
  attribute vec3  aOrbita;
  attribute vec3  aCor;
  attribute float aSatelite;
  attribute float aAtraso;
  attribute float aSemente;
  attribute float aCasca;
  attribute float aTamanho;
  attribute float aBrilho;

  varying float vBrilho;
  varying vec3  vCor;
  varying float vRealce;

  // Campo de rotação barato: soma de senos cruzados entre eixos. Não é ruído
  // de verdade, mas embaralha o interior sem custo de textura nem de FBM.
  vec3 redemoinho(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.9 + t * 1.10) + sin(p.z * 1.3 - t * 0.80),
      sin(p.z * 2.1 + t * 0.90) + sin(p.x * 1.5 - t * 0.70),
      sin(p.x * 1.7 + t * 1.20) + sin(p.y * 1.1 - t * 0.60)
    ) * 0.5;
  }

  void main() {
    // Nascimento: cada partícula parte do seu ponto disperso e entra em
    // espiral até a posição de repouso. O atraso próprio de cada uma é o que
    // faz o orbe se juntar aos poucos em vez de aparecer inteiro de uma vez.
    float atraso = aAtraso * 0.62;
    float t = clamp((uFormacao - atraso) / (1.0 - atraso), 0.0, 1.0);
    float chegada = smoothstep(0.0, 1.0, t);

    vec3 p = mix(aOrigem, position, chegada);

    float giro = (1.0 - chegada) * (1.6 + aSemente * 2.2);
    float cg = cos(giro);
    float sg = sin(giro);
    p = vec3(p.x * cg - p.z * sg, p.y, p.x * sg + p.z * cg);

    float respiracao = 1.0 + 0.030 * sin(uTempo * 0.55 + aSemente * 6.2831);
    p *= mix(1.0, respiracao * uExpansao * (1.0 + uFala * 0.055), chegada);

    vec3 deriva = redemoinho(position * 0.55 + aSemente * 3.0, uTempo * (0.17 + uEnergia * 0.60));
    p += deriva * (0.085 + uEnergia * 0.145) * (0.40 + aCasca) * chegada;

    // Satélites: um punhado de partículas deixa o corpo e descreve uma órbita
    // própria em volta do núcleo. O plano vem do atributo, e dois eixos
    // ortonormais são derivados dele sem ramificação.
    vec3 eixoAux = mix(vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), step(0.9, abs(aOrbita.z)));
    vec3 e1 = normalize(cross(eixoAux, aOrbita));
    vec3 e2 = cross(aOrbita, e1);
    float raioOrb = length(position) * (1.02 + aSemente * 0.16) * (1.0 + uOrbita * 0.22);
    float ang = uTempo * (0.30 + fract(aSemente * 7.0) * 0.45) * (0.55 + uOrbita * 1.25)
              + aSemente * 6.2831;
    vec3 orbita = (e1 * cos(ang) + e2 * sin(ang)) * raioOrb;
    p = mix(p, orbita, aSatelite * (0.30 + uOrbita * 0.70) * chegada);

    float realce = 0.0;

    // Reação localizada: queda gaussiana com a distância até o ponteiro, então
    // só a região sob o cursor se afasta — o resto da esfera nem sente.
    vec3 ateP = p - uPonteiro;
    float distP = length(ateP);
    float influencia = exp(-(distP * distP) / (uRaioPonteiro * uRaioPonteiro)) * uForcaPonteiro * chegada;
    p += normalize(ateP + 1e-5) * influencia * uEmpurrao;
    realce += influencia;

    for (int i = 0; i < ${MAX_ONDAS}; i++) {
      float idade = uTempo - uOndaInicio[i];
      if (idade > 0.0 && idade < ${VIDA_ONDA.toFixed(2)}) {
        vec3 ateO = p - uOndaOrigem[i];
        float d = length(ateO);
        float frente = idade * ${VEL_ONDA.toFixed(2)};
        float anel = exp(-pow((d - frente) / 0.42, 2.0));
        float queda = 1.0 - idade / ${VIDA_ONDA.toFixed(2)};
        float amp = anel * queda * queda * chegada * uOndaForca[i];
        p += normalize(ateO + 1e-5) * amp * 0.20;
        realce += amp;
      }
    }

    // Vários efeitos podem coincidir (ponteiro + ondas sobrepostas); sem teto
    // o orbe inteiro lavaria de branco em vez de mostrar um ponto de impacto.
    realce = min(realce, 1.2);

    float surgir = smoothstep(0.0, 0.22, t);
    float voo = t * (1.0 - t) * 4.0;

    vBrilho = aBrilho * uGanho * surgir
            * (1.0 + realce * 1.0 + uEnergia * 0.35 + voo * 0.60 + uFala * 0.45
               + aSatelite * uOrbita * 0.55);
    vCor = aCor;
    vRealce = realce;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uTamanho * aTamanho * uPixelRatio * (1.0 + realce * 0.35 + voo * 0.25) * (7.0 / -mv.z);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uCorRealce;

  varying float vBrilho;
  varying vec3  vCor;
  varying float vRealce;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;

    float perfil = exp(-r * r * 3.4);
    // Cor definida por partícula (violeta/azul/ciano do filamento); o realce
    // do toque e das ondas puxa em direção ao branco.
    vec3 cor = mix(vCor, uCorRealce, clamp(vRealce, 0.0, 1.0) * 0.35);

    float a = perfil * clamp(vBrilho, 0.0, 3.0);
    // Saída pré-multiplicada somada com fator Um: a cor acende sobre o
    // panorama e o alfa sobe bem mais devagar, que é o que mantém o orbe
    // translúcido em vez de virar um disco sólido.
    gl_FragColor = vec4(cor * a, a * 0.32);
  }
`

// Paleta da referência: violeta e azul elétrico no corpo, ciano no núcleo e
// em algumas correntes, branco só nos picos. Valores em luz linear porque o
// blending é aditivo.
const VIOLETA: [number, number, number] = [0.42, 0.24, 0.98]
const AZUL: [number, number, number] = [0.16, 0.42, 1.0]
const CIANO: [number, number, number] = [0.34, 0.86, 1.0]
const BRANCO: [number, number, number] = [0.80, 0.92, 1.0]

function construirGeometria(total: number) {
  const posicoes = new Float32Array(total * 3)
  const origens = new Float32Array(total * 3)
  const orbitas = new Float32Array(total * 3)
  const cores = new Float32Array(total * 3)
  const satelites = new Float32Array(total)
  const atrasos = new Float32Array(total)
  const sementes = new Float32Array(total)
  const cascas = new Float32Array(total)
  const tamanhos = new Float32Array(total)
  const brilhos = new Float32Array(total)

  let s = 1337
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const rndUnit = (): [number, number, number] => {
    const z = rnd() * 2 - 1
    const a = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    return [r * Math.cos(a), r * Math.sin(a), z]
  }

  let i = 0
  const escreverComum = (dir: [number, number, number]) => {
    // Nuvem de origem para o nascimento: direção própria e distante.
    const [ox, oy, oz] = rndUnit()
    const odist = RAIO * (2.6 + rnd() * 3.2)
    origens[i * 3] = ox * odist
    origens[i * 3 + 1] = oy * odist * 0.6
    origens[i * 3 + 2] = oz * odist
    // Plano de órbita válido para todos (o shader normaliza sem ramificar).
    const [px, py, pz] = dir
    orbitas[i * 3] = px
    orbitas[i * 3 + 1] = py
    orbitas[i * 3 + 2] = pz
    atrasos[i] = rnd()
  }
  const pintar = (cor: [number, number, number], k = 1) => {
    cores[i * 3] = cor[0] * k
    cores[i * 3 + 1] = cor[1] * k
    cores[i * 3 + 2] = cor[2] * k
  }

  const nCore = Math.round(total * 0.11)
  const nSat = Math.round(total * 0.06)
  const nInterior = Math.round(total * 0.54)
  const nStrand = total - nCore - nSat - nInterior

  // ---- núcleo: aglomerado central compacto, ciano/branco, aceso ----------
  for (let c = 0; c < nCore; c++, i++) {
    const dir = rndUnit()
    const raio = RAIO * Math.pow(rnd(), 0.9) * 0.30
    posicoes[i * 3] = dir[0] * raio
    posicoes[i * 3 + 1] = dir[1] * raio
    posicoes[i * 3 + 2] = dir[2] * raio
    escreverComum(rndUnit())
    satelites[i] = 0
    sementes[i] = rnd()
    cascas[i] = 0.15
    const branco = rnd() < 0.16
    pintar(branco ? BRANCO : CIANO, 0.8 + rnd() * 0.4)
    brilhos[i] = (branco ? 1.05 : 0.78) + rnd() * 0.5
    tamanhos[i] = 0.6 + rnd() * 0.4
  }

  // ---- corpo: preenchimento volumétrico dá a bola redonda e translúcida --
  // Uniforme no volume (raio ∝ cbrt), fraco e pequeno — é o brilho interno
  // sobre o qual os filamentos aparecem, sem virar espetos radiais.
  for (let c = 0; c < nInterior; c++, i++) {
    const dir = rndUnit()
    // Uniforme no volume (raio ∝ cbrt) preenchendo quase todo o raio: como o
    // blending é aditivo, o caminho de visão mais longo no centro já clareia o
    // miolo e escurece as bordas sozinho — vira uma bola translúcida cheia, do
    // tamanho da casca de filamentos, e não um ponto pequeno cercado de fios.
    const raio = RAIO * Math.cbrt(rnd()) * 0.78
    posicoes[i * 3] = dir[0] * raio
    posicoes[i * 3 + 1] = dir[1] * raio
    posicoes[i * 3 + 2] = dir[2] * raio
    escreverComum(rndUnit())
    satelites[i] = 0
    sementes[i] = rnd()
    cascas[i] = Math.min(1, raio / RAIO)
    const r = rnd()
    pintar(r < 0.5 ? AZUL : r < 0.8 ? VIOLETA : CIANO, 0.7 + rnd() * 0.3)
    brilhos[i] = 0.30 + rnd() * 0.28
    tamanhos[i] = 0.42 + rnd() * 0.3
  }

  // ---- filamentos: correntes traçadas por um campo curvo ------------------
  // Cada corrente anda pela superfície de uma casca por passos de arco, com o
  // rumo desviado por um campo de senos — é isso que dá as dobras e os vazios.
  const PONTOS_CORRENTE = 130
  const nCorrentes = Math.max(1, Math.round(nStrand / PONTOS_CORRENTE))
  let feitos = 0
  for (let c = 0; c < nCorrentes; c++) {
    const pts = c === nCorrentes - 1 ? nStrand - feitos : PONTOS_CORRENTE
    feitos += pts

    let p = rndUnit()
    const shell = 0.66 + rnd() * 0.2            // casca fina: filamentos na superfície
    const extensao = rnd() < 0.06               // pouquíssimas escapam, e de leve
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28]
    const fq = 1.4 + rnd() * 1.6
    // Cor dominante da corrente: maioria azul, boa parte violeta, poucas ciano.
    const r = rnd()
    const cor = r < 0.5 ? AZUL : r < 0.8 ? VIOLETA : CIANO
    const brilhoBase = (cor === CIANO ? 0.42 : 0.26) + rnd() * 0.20

    for (let k = 0; k < pts; k++, i++) {
      const prog = k / pts
      // rumo tangente desviado pelo campo → curva
      const nx = Math.sin(p[1] * fq + ph[0]) + Math.sin(p[2] * 1.7 - ph[1])
      const ny = Math.sin(p[2] * fq + ph[1]) + Math.sin(p[0] * 1.7 - ph[2])
      const nz = Math.sin(p[0] * fq + ph[2]) + Math.sin(p[1] * 1.7 - ph[0])
      // tangente = componente de n ortogonal a p
      const dot = nx * p[0] + ny * p[1] + nz * p[2]
      let tx = nx - dot * p[0]
      let ty = ny - dot * p[1]
      let tz = nz - dot * p[2]
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl; ty /= tl; tz /= tl
      const dth = 0.026 + rnd() * 0.012
      const cs = Math.cos(dth), sn = Math.sin(dth)
      p = [p[0] * cs + tx * sn, p[1] * cs + ty * sn, p[2] * cs + tz * sn]
      const pl = Math.hypot(p[0], p[1], p[2]) || 1
      p = [p[0] / pl, p[1] / pl, p[2] / pl]

      // raio: casca + dobra (ondulação ao longo da corrente); extensões saem
      const dobra = 0.08 * Math.sin(k * 0.5 + ph[0]) + (rnd() - 0.5) * 0.04
      let rf = shell + dobra
      if (extensao) rf += prog * 0.14
      const raio = RAIO * Math.max(0.18, rf)
      posicoes[i * 3] = p[0] * raio
      posicoes[i * 3 + 1] = p[1] * raio
      posicoes[i * 3 + 2] = p[2] * raio

      escreverComum(rndUnit())
      satelites[i] = 0
      sementes[i] = rnd()
      cascas[i] = Math.min(1, Math.max(0, rf - 0.35))
      const pico = rnd() < 0.05
      pintar(pico ? BRANCO : cor, 0.85 + rnd() * 0.4)
      brilhos[i] = (pico ? 1.0 : brilhoBase) * (1 + (rnd() - 0.5) * 0.4)
      tamanhos[i] = (extensao ? 0.45 : 0.6) + rnd() * 0.4
    }
  }

  // ---- satélites: pequenos grupos orbitando, em poucos planos -------------
  const GRUPOS = 6
  const planos = Array.from({ length: GRUPOS }, () => rndUnit())
  for (let c = 0; c < nSat; c++, i++) {
    const dir = rndUnit()
    const raio = RAIO * (1.05 + rnd() * 0.22)
    posicoes[i * 3] = dir[0] * raio
    posicoes[i * 3 + 1] = dir[1] * raio
    posicoes[i * 3 + 2] = dir[2] * raio
    escreverComum(planos[Math.floor(rnd() * GRUPOS)])
    const grupo = Math.floor(rnd() * GRUPOS)
    satelites[i] = 0.75 + rnd() * 0.25
    sementes[i] = grupo / GRUPOS + rnd() * 0.045
    cascas[i] = 0.9
    pintar(rnd() < 0.5 ? CIANO : AZUL, 0.9 + rnd() * 0.4)
    brilhos[i] = 0.5 + rnd() * 0.4
    tamanhos[i] = 0.55 + rnd() * 0.4
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(posicoes, 3))
  geo.setAttribute('aOrigem', new THREE.BufferAttribute(origens, 3))
  geo.setAttribute('aOrbita', new THREE.BufferAttribute(orbitas, 3))
  geo.setAttribute('aCor', new THREE.BufferAttribute(cores, 3))
  geo.setAttribute('aSatelite', new THREE.BufferAttribute(satelites, 1))
  geo.setAttribute('aAtraso', new THREE.BufferAttribute(atrasos, 1))
  geo.setAttribute('aSemente', new THREE.BufferAttribute(sementes, 1))
  geo.setAttribute('aCasca', new THREE.BufferAttribute(cascas, 1))
  geo.setAttribute('aTamanho', new THREE.BufferAttribute(tamanhos, 1))
  geo.setAttribute('aBrilho', new THREE.BufferAttribute(brilhos, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RAIO * 7)
  return geo
}

type Props = {
  estado: EstadoOrbe
  // `null` = ainda não sabemos a preferência de movimento. Enquanto for null
  // nada é desenhado: é isso que evita o orbe estático aparecer antes da hora.
  movimento: boolean | null
  onPronto?: () => void
  ref?: React.Ref<OrbeHandle>
}

export function Orbe({ estado, movimento, onPronto, ref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visivel, setVisivel] = useState(false)
  const estadoRef = useRef(estado)
  const movimentoRef = useRef(movimento)
  const onProntoRef = useRef(onPronto)
  const sincronizarRef = useRef<() => void>(() => {})
  const pulsarRef = useRef<(intensidade: number) => void>(() => {})

  useEffect(() => { estadoRef.current = estado }, [estado])
  useEffect(() => { onProntoRef.current = onPronto }, [onPronto])
  useEffect(() => {
    movimentoRef.current = movimento
    sincronizarRef.current()
  }, [movimento])

  useImperativeHandle(ref, () => ({ pulsar: i => pulsarRef.current(i) }), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const estreito = window.innerWidth < 640
    const total = estreito ? 20000 : 46000

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'

    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)

    const uniforms = {
      uTempo: { value: 0 },
      uEnergia: { value: 0 },
      uExpansao: { value: 1 },
      uOrbita: { value: 0 },
      uFala: { value: 0 },
      uPonteiro: { value: new THREE.Vector3(0, 0, 999) },
      uForcaPonteiro: { value: 0 },
      uRaioPonteiro: { value: 0.95 },
      uEmpurrao: { value: 0.52 },
      uOndaOrigem: { value: Array.from({ length: MAX_ONDAS }, () => new THREE.Vector3()) },
      uOndaInicio: { value: new Array(MAX_ONDAS).fill(-999) },
      uOndaForca: { value: new Array(MAX_ONDAS).fill(0) },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uTamanho: { value: estreito ? 4.1 : 4.6 },
      uGanho: { value: 1.58 },
      uFormacao: { value: 0 },
      uCorRealce: { value: new THREE.Color('#eaf6ff') },
    }

    const geometria = construirGeometria(total)
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    })
    const pontos = new THREE.Points(geometria, material)
    // Levanta o orbe do centro geométrico: a caixa de conversa ocupa a base.
    pontos.position.y = RAIO * 0.62
    cena.add(pontos)

    let resolvido = false
    let apareceu = false
    let avisouPronto = false

    const desenhar = () => {
      renderer.render(cena, camera)
      if (!apareceu) {
        apareceu = true
        setVisivel(true)
      }
    }
    const avisar = () => {
      if (avisouPronto) return
      avisouPronto = true
      onProntoRef.current?.()
    }

    const dimensionar = () => {
      const l = container.clientWidth
      const a = container.clientHeight
      if (l === 0 || a === 0) return
      renderer.setSize(l, a, false)
      camera.aspect = l / a
      // Enquadra o orbe pela menor dimensão visível, senão em retrato ele
      // encosta nas laterais e em paisagem fica minúsculo.
      const alvo = RAIO * (l < 640 ? 1.9 : 1.55)
      const meioFov = THREE.MathUtils.degToRad(camera.fov) / 2
      const distV = alvo / Math.tan(meioFov)
      const distH = alvo / (Math.tan(meioFov) * camera.aspect)
      camera.position.set(0, 0, Math.max(distV, distH))
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      uniforms.uPixelRatio.value = renderer.getPixelRatio()
      if (resolvido && !movimentoRef.current) desenhar()
    }
    dimensionar()
    const ro = new ResizeObserver(dimensionar)
    ro.observe(container)

    // --- ponteiro -----------------------------------------------------------
    const raycaster = new THREE.Raycaster()
    const planoOrbe = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const ndc = new THREE.Vector2()
    const alvoPonteiro = new THREE.Vector3(0, 0, 999)
    const ponteiroSuave = new THREE.Vector3(0, 0, 999)
    const ponteiroLocal = new THREE.Vector3()
    let forcaAlvo = 0
    let proximaOnda = 0

    const paraMundo = (clientX: number, clientY: number) => {
      const r = container.getBoundingClientRect()
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(planoOrbe, alvoPonteiro)
    }

    const aoMover = (e: PointerEvent) => {
      if (!movimentoRef.current) return
      if (paraMundo(e.clientX, e.clientY)) {
        if (ponteiroSuave.z > 100) ponteiroSuave.copy(alvoPonteiro)
        forcaAlvo = 1
      }
    }
    const aoSair = () => { forcaAlvo = 0 }
    // No toque existe "soltar"; no mouse não, e enquanto ele paira faz sentido
    // a região continuar cedendo.
    const aoSoltar = (e: PointerEvent) => { if (e.pointerType !== 'mouse') forcaAlvo = 0 }

    const dispararOnda = (origem: THREE.Vector3, forca: number) => {
      uniforms.uOndaOrigem.value[proximaOnda].copy(origem)
      uniforms.uOndaInicio.value[proximaOnda] = uniforms.uTempo.value
      uniforms.uOndaForca.value[proximaOnda] = forca
      proximaOnda = (proximaOnda + 1) % MAX_ONDAS
    }

    const aoPressionar = (e: PointerEvent) => {
      if (!movimentoRef.current) return
      // Clique dentro da caixa de conversa é da caixa, não do orbe.
      if (e.target instanceof Element && e.target.closest('[data-sem-onda]')) return
      if (paraMundo(e.clientX, e.clientY)) {
        pontos.updateMatrixWorld()
        dispararOnda(pontos.worldToLocal(alvoPonteiro.clone()), 1)
      }
    }

    const origemCentro = new THREE.Vector3(0, 0, 0)
    let falaAlvo = 0
    // Cada palavra revelada vira uma onda saindo do centro mais um pico de
    // luminosidade; é isso que amarra a animação à apresentação do texto.
    pulsarRef.current = intensidade => {
      if (!movimentoRef.current) return
      dispararOnda(origemCentro, 0.32 + intensidade * 0.5)
      falaAlvo = Math.max(falaAlvo, 0.45 + intensidade * 0.55)
    }

    window.addEventListener('pointermove', aoMover, { passive: true })
    window.addEventListener('pointerdown', aoPressionar, { passive: true })
    window.addEventListener('pointerup', aoSoltar, { passive: true })
    window.addEventListener('pointerleave', aoSair)
    window.addEventListener('pointercancel', aoSair)

    // --- laço ---------------------------------------------------------------
    let raf = 0
    let ultimo = performance.now()
    let energia = 0
    let expansao = 1
    let orbita = 0
    let nasceuAnimado = false

    const passo = (agora: number) => {
      raf = requestAnimationFrame(passo)
      const dt = Math.min((agora - ultimo) / 1000, 0.05)
      ultimo = agora
      uniforms.uTempo.value += dt
      if (uniforms.uFormacao.value < 1) {
        uniforms.uFormacao.value = Math.min(1, uniforms.uFormacao.value + dt / SEG_FORMACAO)
        // Avisa antes do fim: a saudação começa enquanto o orbe ainda assenta,
        // em vez de deixar a tela muda esperando o último grão chegar.
        if (uniforms.uFormacao.value >= 0.72) avisar()
        if (uniforms.uFormacao.value >= 1) nasceuAnimado = true
      }

      const est = estadoRef.current
      const energiaAlvo = est === 'pensando' ? 1 : est === 'respondendo' ? 0.62 : 0
      const expansaoAlvo = est === 'pensando' ? 0.93 : est === 'respondendo' ? 1.07 : 1
      // Nunca zera: mesmo em repouso alguns satélites continuam orbitando.
      const orbitaAlvo = est === 'pensando' ? 1 : est === 'respondendo' ? 0.42 : 0.14
      const k = 1 - Math.exp(-dt * 2.6)
      energia += (energiaAlvo - energia) * k
      expansao += (expansaoAlvo - expansao) * k
      // Satélites desaceleram mais devagar que o resto, para o fim da resposta
      // não ter corte seco.
      orbita += (orbitaAlvo - orbita) * (1 - Math.exp(-dt * 1.5))
      uniforms.uEnergia.value = energia
      uniforms.uExpansao.value = expansao
      uniforms.uOrbita.value = orbita

      falaAlvo *= Math.exp(-dt * 3.4)
      uniforms.uFala.value += (falaAlvo - uniforms.uFala.value) * (1 - Math.exp(-dt * 9))

      ponteiroSuave.lerp(alvoPonteiro, 1 - Math.exp(-dt * 9))
      // O shader trabalha em espaço local; o orbe está deslocado e girando,
      // então o ponto do mundo precisa ser convertido a cada frame para a
      // deformação continuar exatamente sob o cursor.
      pontos.updateMatrixWorld()
      uniforms.uPonteiro.value.copy(pontos.worldToLocal(ponteiroLocal.copy(ponteiroSuave)))
      const fp = uniforms.uForcaPonteiro
      fp.value += (forcaAlvo - fp.value) * (1 - Math.exp(-dt * (forcaAlvo > fp.value ? 7 : 2.4)))

      pontos.rotation.y += dt * 0.035
      pontos.rotation.x = Math.sin(uniforms.uTempo.value * 0.12) * 0.06

      desenhar()
    }

    const sincronizar = () => {
      const mov = movimentoRef.current
      if (mov === null) return
      cancelAnimationFrame(raf)
      if (!resolvido) {
        resolvido = true
        // Sem movimento o orbe já existe pronto; com movimento ele nasce.
        uniforms.uFormacao.value = mov ? 0 : 1
      }
      if (!mov) {
        desenhar()
        avisar()
        return
      }
      // Ligar o movimento refaz o nascimento: quem acabou de pedir animação
      // quer ver o orbe se formar, não encontrá-lo já pronto.
      if (uniforms.uFormacao.value >= 1 && !nasceuAnimado) uniforms.uFormacao.value = 0
      if (!document.hidden) {
        ultimo = performance.now()
        raf = requestAnimationFrame(passo)
      }
    }
    sincronizarRef.current = sincronizar
    sincronizar()
    document.addEventListener('visibilitychange', sincronizar)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', sincronizar)
      window.removeEventListener('pointermove', aoMover)
      window.removeEventListener('pointerdown', aoPressionar)
      window.removeEventListener('pointerup', aoSoltar)
      window.removeEventListener('pointerleave', aoSair)
      window.removeEventListener('pointercancel', aoSair)
      ro.disconnect()
      geometria.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] transition-opacity duration-700 ease-out"
      style={{ opacity: visivel ? 1 : 0 }}
    >
      <div className="absolute left-1/2 top-[40%] size-[min(62vw,52vh)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(90,200,255,0.30),rgba(60,120,240,0.12)_52%,transparent_76%)] blur-2xl" />
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
