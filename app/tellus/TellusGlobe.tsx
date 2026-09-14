'use client'

// Experimento visual "Tellus" — cena 3D de fundo: globo estilizado com
// pontos de conexão e arcos brilhantes, bloom via EffectComposer manual
// (three/examples/jsm/postprocessing direto, sem @react-three/postprocessing
// — mais estável na versão do three já instalada neste round) e câmera com
// autorotate contínuo (drei OrbitControls com toda interação desligada:
// existe só pra girar sozinha, não pra o usuário mexer).
import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

const EARTH_TEXTURE_URL = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
const RADIUS = 2
const MOBILE_BREAKPOINT = 640

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

// Pontos de conexão (lat, lon) — espalhados pelo globo, com destaque em São
// Paulo (índice 0), de onde saem os arcos, ecoando a referência visual.
const POINTS: [number, number][] = [
  [-23.5, -46.6], // São Paulo — destaque
  [40.7, -74.0],
  [51.5, -0.1],
  [35.7, 139.7],
  [1.3, 103.8],
  [-33.9, 151.2],
  [55.7, 37.6],
  [19.4, -99.1],
  [28.6, 77.2],
  [-26.2, 28.0],
]
const HUB_INDEX = 0

function ConnectionArcs() {
  const points3d = useMemo(() => POINTS.map(([lat, lon]) => latLonToVector3(lat, lon, RADIUS)), [])
  const arcs = useMemo(() => {
    const hub = points3d[HUB_INDEX]
    return points3d
      .map((p, i) => {
        if (i === HUB_INDEX) return null
        const mid = hub.clone().add(p).multiplyScalar(0.5)
        mid.setLength(RADIUS * 1.35)
        const curve = new THREE.QuadraticBezierCurve3(hub, mid, p)
        return curve.getPoints(48)
      })
      .filter((pts): pts is THREE.Vector3[] => pts !== null)
  }, [points3d])

  return (
    <group>
      {arcs.map((points, i) => (
        <Line key={i} points={points} color="#6fd8ff" transparent opacity={0.5} lineWidth={1} />
      ))}
      {points3d.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[i === HUB_INDEX ? RADIUS * 0.03 : RADIUS * 0.017, 12, 12]} />
          <meshBasicMaterial color={i === HUB_INDEX ? '#9df3ff' : '#4fa3ff'} />
        </mesh>
      ))}
    </group>
  )
}

/** Textura procedural (canvas 2D) usada quando a textura remota falha ou não carrega a tempo — continentes esquematizados, nunca trava a cena. */
function makeProceduralEarthTexture(): THREE.CanvasTexture {
  const width = 512
  const height = 256
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const ocean = ctx.createLinearGradient(0, 0, 0, height)
  ocean.addColorStop(0, '#0c2d57')
  ocean.addColorStop(1, '#081b38')
  ctx.fillStyle = ocean
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#1c4a7a'
  const blobs: [number, number, number, number][] = [
    [70, 70, 55, 34], [140, 100, 40, 26], [270, 55, 70, 30], [320, 120, 48, 34],
    [400, 80, 62, 38], [445, 140, 40, 22], [200, 165, 80, 26], [55, 155, 46, 20],
    [460, 50, 30, 18],
  ]
  for (const [x, y, w, h] of blobs) {
    ctx.beginPath()
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.strokeStyle = 'rgba(130,205,255,0.14)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * width
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
  }
  for (let j = 0; j <= 6; j++) {
    const y = (j / 6) * height
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function useEarthTexture() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      EARTH_TEXTURE_URL,
      (tex) => {
        if (cancelled) return
        tex.colorSpace = THREE.SRGBColorSpace
        setTexture(tex)
      },
      undefined,
      () => {
        // Textura remota falhou (rede/CORS) — cai pro procedural, nunca trava.
        if (!cancelled) setTexture(makeProceduralEarthTexture())
      },
    )
    return () => { cancelled = true }
  }, [])

  return texture
}

function Earth() {
  const map = useEarthTexture()
  return (
    <group>
      <mesh>
        <sphereGeometry args={[RADIUS, 64, 64]} />
        {map ? (
          <meshStandardMaterial map={map} roughness={0.85} metalness={0.1} emissive="#0a1e3d" emissiveIntensity={0.18} />
        ) : (
          <meshStandardMaterial color="#123a63" roughness={0.9} />
        )}
      </mesh>
      {/* Halo de atmosfera — face de dentro (BackSide) pra dar o brilho azul na borda. */}
      <mesh scale={1.04}>
        <sphereGeometry args={[RADIUS, 48, 48]} />
        <meshBasicMaterial color="#3b9bff" transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

function BloomEffects() {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const instance = new EffectComposer(gl)
    instance.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 1.2, 0.4, 0.15)
    instance.addPass(bloom)
    return instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setSize(size.width, size.height)
  }, [composer, size])

  // Prioridade > 0 tira o r3f do modo de render automático — a partir daqui
  // somos nós que desenhamos o frame, via composer (é assim que se pluga
  // post-processing manual do three "puro" dentro do react-three-fiber).
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
      camera={{ position: [0, 0.6, 5.2], fov: 45 }}
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
    >
      <color attach="background" args={['#050812']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 3, 5]} intensity={1.3} />
      <Earth />
      <ConnectionArcs />
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.6}
        enableZoom={false}
        enablePan={false}
        enableRotate={false}
      />
      {/* Bloom é o efeito caro — desligado abaixo do breakpoint mobile pra não travar aparelho médio. */}
      {!isMobile && <BloomEffects />}
    </Canvas>
  )
}
