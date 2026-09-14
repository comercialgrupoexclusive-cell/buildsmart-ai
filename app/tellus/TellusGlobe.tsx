'use client'

// Experimento visual "Tellus" — cena 3D de fundo.
//
// O globo NÃO é feito à mão nem usa textura fotográfica: é o `three-globe`
// (a biblioteca por trás do globe.gl), com a camada de hexPolygons em modo
// "dots" desenhando os países como pontos — que é exatamente o globo de
// partículas da referência. Os países vêm do pacote `world-atlas`
// (TopoJSON, empacotado no bundle), então a cena não depende de CDN nem de
// rede em runtime.
//
// O que continua sendo cena própria aqui: estrelas, anéis orbitais, o feixe
// de luz saindo da plataforma e o bloom (UnrealBloomPass) — é o bloom que
// dá o neon, e ele fica LIGADO também no mobile, só em meia resolução.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import ThreeGlobe from 'three-globe'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import countries110m from 'world-atlas/countries-110m.json'

const RAIO_MUNDO = 2.05          // raio do globo no espaço da cena
const RAIO_NATIVO = 100          // three-globe trabalha em raio 100
const ESCALA = RAIO_MUNDO / RAIO_NATIVO
const MOBILE_BREAKPOINT = 640

const SAO_PAULO = { lat: -23.5, lng: -46.6 }

// Destinos dos arcos que saem de São Paulo (mesma ideia da referência:
// um território conectado ao resto do mundo).
const DESTINOS = [
  { lat: 40.7, lng: -74.0 },
  { lat: 51.5, lng: -0.1 },
  { lat: 35.7, lng: 139.7 },
  { lat: 1.3, lng: 103.8 },
  { lat: -33.9, lng: 151.2 },
  { lat: 55.7, lng: 37.6 },
  { lat: 19.4, lng: -99.1 },
  { lat: 28.6, lng: 77.2 },
  { lat: -26.2, lng: 28.0 },
]

function latLngToVector3(lat: number, lng: number, raio: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -raio * Math.sin(phi) * Math.cos(theta),
    raio * Math.cos(phi),
    raio * Math.sin(phi) * Math.sin(theta),
  )
}

/** Globo de pontos do three-globe, com arcos e anéis pulsantes. */
function GlobeLayer({ resolucao }: { resolucao: number }) {
  const globe = useMemo(() => {
    const topo = countries110m as unknown as Topology<{ countries: GeometryCollection }>
    const paises = feature(topo, topo.objects.countries)
    // A Antártida cruza o polo e não aparece no enquadramento da referência
    // — fora da camada de pontos.
    const features = paises.features.filter((f) => String(f.id) !== '010')

    const instancia = new ThreeGlobe({ animateIn: false })
      // Continentes como pontos — é isso que faz o globo de partículas.
      .hexPolygonsData(features)
      .hexPolygonResolution(resolucao)
      .hexPolygonMargin(0.42)
      .hexPolygonUseDots(true)
      .hexPolygonColor(() => '#6fdcff')
      .hexPolygonAltitude(0.006)
      // Arcos saindo de São Paulo.
      .arcsData(DESTINOS.map((d) => ({ startLat: SAO_PAULO.lat, startLng: SAO_PAULO.lng, endLat: d.lat, endLng: d.lng })))
      .arcColor(() => ['rgba(150,235,255,0.95)', 'rgba(60,150,255,0.25)'])
      .arcAltitudeAutoScale(0.42)
      .arcStroke(0.28)
      .arcDashLength(0.45)
      .arcDashGap(0.25)
      .arcDashAnimateTime(3200)
      // Anel pulsante no hub.
      .ringsData([{ lat: SAO_PAULO.lat, lng: SAO_PAULO.lng }])
      // Cor sólida de propósito: com função interpoladora o three-globe gera
      // a textura do anel por canvas 2D e estoura INDEX_SIZE_ERR na build de
      // produção. O anel continua pulsando igual.
      .ringColor(() => 'rgba(140,230,255,0.85)')
      .ringMaxRadius(6)
      .ringPropagationSpeed(2.2)
      .ringRepeatPeriod(900)
      .showAtmosphere(true)
      .atmosphereColor('#3f9dff')
      .atmosphereAltitude(0.16)

    // Esfera escura e translúcida por baixo dos pontos: dá corpo ao globo
    // sem virar "planeta fotográfico" e ainda tampa os pontos do lado de trás.
    const material = instancia.globeMaterial() as THREE.MeshPhongMaterial
    material.color = new THREE.Color('#061427')
    material.emissive = new THREE.Color('#07203d')
    material.emissiveIntensity = 0.5
    material.shininess = 2
    material.transparent = true
    material.opacity = 0.92

    instancia.scale.setScalar(ESCALA)
    return instancia
  }, [resolucao])

  useEffect(() => () => {
    // three-globe cria geometrias/materiais próprios; libera ao desmontar.
    globe.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  }, [globe])

  return <primitive object={globe} />
}

/** Anéis orbitais inclinados com nós, girando devagar em torno do globo. */
function OrbitRings() {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.08
  })

  const rings = useMemo(
    () => [
      { radius: RAIO_MUNDO * 1.34, rot: [Math.PI / 2.35, 0, 0.32] as [number, number, number], opacity: 0.5, nodes: 3 },
      { radius: RAIO_MUNDO * 1.58, rot: [Math.PI / 1.85, 0.4, -0.2] as [number, number, number], opacity: 0.36, nodes: 4 },
      { radius: RAIO_MUNDO * 1.82, rot: [Math.PI / 2.9, -0.3, 0.6] as [number, number, number], opacity: 0.26, nodes: 2 },
    ],
    [],
  )

  return (
    <group ref={group}>
      {rings.map((ring, i) => (
        <group key={ring.radius} rotation={ring.rot}>
          <mesh>
            <torusGeometry args={[ring.radius, 0.006, 6, 180]} />
            <meshBasicMaterial color="#4aa9ff" transparent opacity={ring.opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          {Array.from({ length: ring.nodes }).map((_, n) => {
            const angle = (n / ring.nodes) * Math.PI * 2 + i
            return (
              <mesh key={n} position={[Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius, 0]}>
                <sphereGeometry args={[0.04, 12, 12]} />
                <meshBasicMaterial color="#bfefff" />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}

/** Plataforma circular + feixe vertical de luz subindo em direção ao globo. */
function LightColumn() {
  return (
    <group position={[0, -3.5, 0]}>
      {[1.55, 2.1, 2.68].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.012, 6, 140]} />
          <meshBasicMaterial color="#3aa5ff" transparent opacity={0.6 - i * 0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.4, 1.3, 3.2, 40, 1, true]} />
        <meshBasicMaterial color="#2f8fff" transparent opacity={0.1} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** PRNG determinístico (mulberry32): o campo de estrelas fica idêntico a
 *  cada render — e o useMemo continua puro, como a regra do React Compiler
 *  exige (Math.random() ali dentro é impuro). */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Starfield({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const rand = mulberry32(20260914)
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 28 + rand() * 45
      const theta = rand() * Math.PI * 2
      const phi = Math.acos(2 * rand() - 1)
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return geo
  }, [count])

  return (
    <points geometry={geometry}>
      <pointsMaterial size={0.13} color="#cfe4ff" sizeAttenuation transparent opacity={0.5} depthWrite={false} />
    </points>
  )
}

/** O planeta gira devagar; os arcos e o hub giram junto com ele. */
function SpinningGlobe({ resolucao, offsetY }: { resolucao: number; offsetY: number }) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.055
  })
  return (
    <group ref={group} position={[0, offsetY, 0]} rotation={[0.3, 0, 0.07]}>
      <GlobeLayer resolucao={resolucao} />
      {/* Marcador do hub (São Paulo), fora do three-globe pra poder brilhar forte. */}
      <mesh position={latLngToVector3(SAO_PAULO.lat, SAO_PAULO.lng, RAIO_MUNDO * 1.01)}>
        <sphereGeometry args={[0.05, 14, 14]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

function BloomEffects({ half }: { half: boolean }) {
  const { gl, scene, camera, size } = useThree()

  const composer = useMemo(() => {
    const instance = new EffectComposer(gl)
    instance.addPass(new RenderPass(scene, camera))
    const escala = half ? 0.5 : 1
    // strength ~1.2 / radius ~0.4. O threshold precisa ser alto: com tanto
    // elemento aditivo, threshold baixo estoura a cena inteira em branco.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width * escala, size.height * escala),
      1.15,
      0.4,
      0.5,
    )
    instance.addPass(bloom)
    return instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, half])

  useEffect(() => { composer.setSize(size.width, size.height) }, [composer, size])

  // Prioridade > 0 tira o r3f do render automático: quem desenha o frame
  // daqui pra frente é o composer.
  useFrame((_, delta) => { composer.render(delta) }, 1)

  return null
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false,
  )
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < MOBILE_BREAKPOINT) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export function TellusGlobe() {
  const isMobile = useIsMobileViewport()

  return (
    <Canvas
      camera={{ position: [0, 0.4, isMobile ? 9.8 : 8.4], fov: 42 }}
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
    >
      <color attach="background" args={['#030610']} />
      {/* three-globe usa MeshPhong no globo: precisa de luz pra não ficar preto. */}
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 3, 5]} intensity={0.8} />
      <Starfield count={isMobile ? 900 : 1800} />
      {/* No mobile o globo sobe: os cards ocupam a metade de baixo da tela. */}
      <SpinningGlobe resolucao={isMobile ? 3 : 3} offsetY={isMobile ? 2.1 : 0} />
      <OrbitRings />
      <LightColumn />
      <BloomEffects half={isMobile} />
    </Canvas>
  )
}
