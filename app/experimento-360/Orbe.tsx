'use client'

// A reação ao ponteiro é adaptada de sphere-particle-wrap, de Safar Isaev
// (https://github.com/SafarSoFar/sphere-particle-wrap), MIT © 2025 — de lá vem
// a ideia de projetar o cursor no plano do orbe e empurrar cada partícula por
// proximidade, voltando ao repouso por interpolação. A implementação aqui é
// outra: o original usa um Mesh por ponto e move tudo na CPU, o que não escala
// para dezenas de milhares de partículas; aqui é um único THREE.Points e o
// deslocamento acontece no vertex shader.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export type EstadoOrbe = 'repouso' | 'pensando' | 'respondendo'

const RAIO = 2.25
const MAX_ONDAS = 3
const VIDA_ONDA = 2.6
const VEL_ONDA = 2.15

const vertexShader = /* glsl */ `
  uniform float uTempo;
  uniform float uEnergia;
  uniform float uExpansao;
  uniform vec3  uPonteiro;
  uniform float uForcaPonteiro;
  uniform float uRaioPonteiro;
  uniform float uEmpurrao;
  uniform vec3  uOndaOrigem[${MAX_ONDAS}];
  uniform float uOndaInicio[${MAX_ONDAS}];
  uniform float uPixelRatio;
  uniform float uTamanho;
  uniform float uGanho;

  attribute float aSemente;
  attribute float aCasca;
  attribute float aTamanho;
  attribute float aBrilho;

  varying float vBrilho;
  varying float vCasca;
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
    vec3 p = position;

    float respiracao = 1.0 + 0.030 * sin(uTempo * 0.55 + aSemente * 6.2831);
    p *= respiracao * uExpansao;

    vec3 deriva = redemoinho(position * 0.55 + aSemente * 3.0, uTempo * (0.17 + uEnergia * 0.60));
    p += deriva * (0.085 + uEnergia * 0.145) * (0.40 + aCasca);

    float realce = 0.0;

    // Reação localizada: queda gaussiana com a distância até o ponteiro, então
    // só a região sob o cursor se afasta — o resto da esfera nem sente.
    vec3 ateP = p - uPonteiro;
    float distP = length(ateP);
    float influencia = exp(-(distP * distP) / (uRaioPonteiro * uRaioPonteiro)) * uForcaPonteiro;
    p += normalize(ateP + 1e-5) * influencia * uEmpurrao;
    realce += influencia;

    for (int i = 0; i < ${MAX_ONDAS}; i++) {
      float idade = uTempo - uOndaInicio[i];
      if (idade > 0.0 && idade < ${VIDA_ONDA.toFixed(1)}) {
        vec3 ateO = p - uOndaOrigem[i];
        float d = length(ateO);
        float frente = idade * ${VEL_ONDA.toFixed(2)};
        float anel = exp(-pow((d - frente) / 0.42, 2.0));
        float queda = 1.0 - idade / ${VIDA_ONDA.toFixed(1)};
        float amp = anel * queda * queda;
        p += normalize(ateO + 1e-5) * amp * 0.42;
        realce += amp;
      }
    }

    // Vários efeitos podem coincidir (ponteiro + ondas sobrepostas); sem teto
    // o orbe inteiro lavaria de branco em vez de mostrar um ponto de impacto.
    realce = min(realce, 1.2);

    vBrilho = aBrilho * uGanho * (1.0 + realce * 1.0 + uEnergia * 0.35);
    vCasca = aCasca;
    vRealce = realce;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uTamanho * aTamanho * uPixelRatio * (1.0 + realce * 0.35) * (7.0 / -mv.z);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uCorNucleo;
  uniform vec3 uCorCasca;
  uniform vec3 uCorRealce;

  varying float vBrilho;
  varying float vCasca;
  varying float vRealce;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;

    float perfil = exp(-r * r * 3.4);
    vec3 cor = mix(uCorNucleo, uCorCasca, vCasca);
    cor = mix(cor, uCorRealce, clamp(vRealce, 0.0, 1.0) * 0.32);

    float a = perfil * clamp(vBrilho, 0.0, 3.0);
    // Saída pré-multiplicada somada com fator Um: a cor acende sobre o
    // panorama e o alfa sobe bem mais devagar, que é o que mantém o orbe
    // translúcido em vez de virar um disco sólido.
    gl_FragColor = vec4(cor * a, a * 0.32);
  }
`

function construirGeometria(total: number) {
  const posicoes = new Float32Array(total * 3)
  const sementes = new Float32Array(total)
  const cascas = new Float32Array(total)
  const tamanhos = new Float32Array(total)
  const brilhos = new Float32Array(total)

  // Contorno irregular: três oitavas de senos cruzados sobre a direção do
  // ponto. Fica embutido na posição de repouso, então o recorte da silhueta
  // não custa nada por frame.
  const relevo = (x: number, y: number, z: number) =>
    0.55 * Math.sin(2.1 * x + 1.3) * Math.sin(1.8 * y - 0.7) * Math.sin(2.4 * z + 2.2) +
    0.30 * Math.sin(4.3 * y + 0.4) * Math.sin(3.7 * z - 1.1) * Math.sin(4.1 * x + 0.9) +
    0.15 * Math.sin(7.9 * z + 2.0) * Math.sin(8.3 * x + 0.2) * Math.sin(7.1 * y - 1.7)

  let s = 1337
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }

  for (let i = 0; i < total; i++) {
    // z uniforme em [-1,1] é o que dá distribuição uniforme na esfera; sortear
    // latitude direto amontoaria tudo nos polos.
    const z = rnd() * 2 - 1
    const t = rnd() * Math.PI * 2
    const rxy = Math.sqrt(1 - z * z)
    const dx = rxy * Math.cos(t)
    const dy = rxy * Math.sin(t)
    const dz = z

    const sorte = rnd()
    let raio: number
    let casca: number
    let brilho: number
    let tamanho: number

    if (sorte < 0.55) {
      raio = RAIO * (1 + relevo(dx * 2, dy * 2, dz * 2) * 0.13) + (rnd() - 0.5) * 0.05
      casca = 1
      brilho = 0.75 + rnd() * 0.55
      tamanho = 0.75 + rnd() * 0.5
    } else if (sorte < 0.79) {
      raio = RAIO * Math.cbrt(rnd()) * 0.92
      casca = 0.18
      brilho = 0.24 + rnd() * 0.30
      tamanho = 0.6 + rnd() * 0.45
    } else if (sorte < 0.87) {
      // Miolo luminoso: é ele que dá o núcleo aceso da referência.
      raio = RAIO * Math.cbrt(rnd()) * 0.34
      casca = 0.55
      brilho = 0.85 + rnd() * 0.7
      tamanho = 0.8 + rnd() * 0.6
    } else {
      // Filamentos soltos além da casca: é deles que vem a borda rasgada.
      raio = RAIO * (1.02 + Math.pow(rnd(), 2) * 0.42)
      casca = 0.85
      brilho = 0.14 + rnd() * 0.22
      tamanho = 0.45 + rnd() * 0.35
    }

    posicoes[i * 3] = dx * raio
    posicoes[i * 3 + 1] = dy * raio
    posicoes[i * 3 + 2] = dz * raio
    sementes[i] = rnd()
    cascas[i] = casca
    brilhos[i] = brilho
    tamanhos[i] = tamanho
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(posicoes, 3))
  geo.setAttribute('aSemente', new THREE.BufferAttribute(sementes, 1))
  geo.setAttribute('aCasca', new THREE.BufferAttribute(cascas, 1))
  geo.setAttribute('aTamanho', new THREE.BufferAttribute(tamanhos, 1))
  geo.setAttribute('aBrilho', new THREE.BufferAttribute(brilhos, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RAIO * 2)
  return geo
}

export function Orbe({ estado }: { estado: EstadoOrbe }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const estadoRef = useRef(estado)
  useEffect(() => { estadoRef.current = estado }, [estado])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)')
    const estreito = window.innerWidth < 640
    const total = estreito ? 15000 : 34000

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
      uPonteiro: { value: new THREE.Vector3(0, 0, 999) },
      uForcaPonteiro: { value: 0 },
      uRaioPonteiro: { value: 0.95 },
      uEmpurrao: { value: 0.52 },
      uOndaOrigem: { value: Array.from({ length: MAX_ONDAS }, () => new THREE.Vector3()) },
      uOndaInicio: { value: new Array(MAX_ONDAS).fill(-999) },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uTamanho: { value: estreito ? 3.1 : 3.5 },
      uGanho: { value: 1.15 },
      uCorNucleo: { value: new THREE.Color('#1b4fe0') },
      uCorCasca: { value: new THREE.Color('#5fdcff') },
      uCorRealce: { value: new THREE.Color('#b9ecff') },
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
    pontos.position.y = RAIO * 0.16
    cena.add(pontos)

    const dimensionar = () => {
      const l = container.clientWidth
      const a = container.clientHeight
      if (l === 0 || a === 0) return
      renderer.setSize(l, a, false)
      camera.aspect = l / a
      // Enquadra o orbe pela menor dimensão visível, senão em retrato ele
      // encosta nas laterais e em paisagem fica minúsculo.
      const alvo = RAIO * (l < 640 ? 2.15 : 1.80)
      const meioFov = THREE.MathUtils.degToRad(camera.fov) / 2
      const distV = alvo / Math.tan(meioFov)
      const distH = alvo / (Math.tan(meioFov) * camera.aspect)
      camera.position.set(0, 0, Math.max(distV, distH))
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      uniforms.uPixelRatio.value = renderer.getPixelRatio()
      if (semMovimento.matches) renderer.render(cena, camera)
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
      if (semMovimento.matches) return
      if (paraMundo(e.clientX, e.clientY)) {
        if (ponteiroSuave.z > 100) ponteiroSuave.copy(alvoPonteiro)
        forcaAlvo = 1
      }
    }
    const aoSair = () => { forcaAlvo = 0 }

    const dispararOnda = (origem: THREE.Vector3) => {
      uniforms.uOndaOrigem.value[proximaOnda].copy(origem)
      uniforms.uOndaInicio.value[proximaOnda] = uniforms.uTempo.value
      proximaOnda = (proximaOnda + 1) % MAX_ONDAS
    }

    const aoPressionar = (e: PointerEvent) => {
      if (semMovimento.matches) return
      // Clique dentro da caixa de conversa é da caixa, não do orbe.
      if (e.target instanceof Element && e.target.closest('[data-sem-onda]')) return
      if (paraMundo(e.clientX, e.clientY)) {
        pontos.updateMatrixWorld()
        dispararOnda(pontos.worldToLocal(alvoPonteiro.clone()))
      }
    }

    window.addEventListener('pointermove', aoMover, { passive: true })
    window.addEventListener('pointerdown', aoPressionar, { passive: true })
    window.addEventListener('pointerleave', aoSair)
    window.addEventListener('pointercancel', aoSair)

    // --- laço ---------------------------------------------------------------
    let raf = 0
    let ultimo = performance.now()
    let energia = 0
    let expansao = 1
    let proximaPulsacao = 0

    const passo = (agora: number) => {
      raf = requestAnimationFrame(passo)
      const dt = Math.min((agora - ultimo) / 1000, 0.05)
      ultimo = agora
      uniforms.uTempo.value += dt

      const est = estadoRef.current
      const energiaAlvo = est === 'pensando' ? 1 : est === 'respondendo' ? 0.62 : 0
      const expansaoAlvo = est === 'pensando' ? 0.93 : est === 'respondendo' ? 1.07 : 1
      const k = 1 - Math.exp(-dt * 2.6)
      energia += (energiaAlvo - energia) * k
      expansao += (expansaoAlvo - expansao) * k
      uniforms.uEnergia.value = energia
      uniforms.uExpansao.value = expansao

      if (est === 'respondendo' && uniforms.uTempo.value > proximaPulsacao) {
        dispararOnda(new THREE.Vector3(0, 0, 0))
        proximaPulsacao = uniforms.uTempo.value + 0.95
      }
      if (est !== 'respondendo') proximaPulsacao = 0

      ponteiroSuave.lerp(alvoPonteiro, 1 - Math.exp(-dt * 9))
      // O shader trabalha em espaço local; o orbe está deslocado e girando,
      // então o ponto do mundo precisa ser convertido a cada frame para a
      // deformação continuar exatamente sob o cursor.
      pontos.updateMatrixWorld()
      uniforms.uPonteiro.value.copy(pontos.worldToLocal(ponteiroLocal.copy(ponteiroSuave)))
      const fp = uniforms.uForcaPonteiro
      fp.value += (forcaAlvo - fp.value) * (1 - Math.exp(-dt * (forcaAlvo > fp.value ? 7 : 3.2)))

      pontos.rotation.y += dt * 0.035
      pontos.rotation.x = Math.sin(uniforms.uTempo.value * 0.12) * 0.06

      renderer.render(cena, camera)
    }

    // Com movimento reduzido o orbe não anima: desenha uma vez e só volta a
    // desenhar se a área mudar. O estado da conversa continua legível pela
    // legenda de texto da caixa.
    const sincronizar = () => {
      cancelAnimationFrame(raf)
      if (semMovimento.matches) {
        renderer.render(cena, camera)
        return
      }
      if (!document.hidden) {
        ultimo = performance.now()
        raf = requestAnimationFrame(passo)
      }
    }
    sincronizar()
    document.addEventListener('visibilitychange', sincronizar)
    semMovimento.addEventListener('change', sincronizar)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', sincronizar)
      semMovimento.removeEventListener('change', sincronizar)
      window.removeEventListener('pointermove', aoMover)
      window.removeEventListener('pointerdown', aoPressionar)
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
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      <div className="absolute left-1/2 top-[44%] size-[min(78vw,60vh)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(70,150,255,0.22),rgba(40,90,200,0.08)_55%,transparent_78%)] blur-2xl" />
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
