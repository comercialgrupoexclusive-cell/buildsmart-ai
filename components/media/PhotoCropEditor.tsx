'use client'

import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Check, Loader2, RotateCcw, X } from 'lucide-react'

type Props = {
  imageUrl: string
  imageName: string
  onClose: () => void
  onSave: (blob: Blob) => Promise<void>
}

const RATIOS = [
  { label: 'Quadrado', value: 1 },
  { label: 'Feed', value: 4 / 5 },
  { label: 'Paisagem', value: 16 / 9 },
]

export function PhotoCropEditor({ imageUrl, imageName, onClose, onSave }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [ratio, setRatio] = useState(4 / 5)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const complete = useCallback((_area: Area, croppedAreaPixels: Area) => setPixels(croppedAreaPixels), [])

  async function save() {
    if (!pixels || saving) return
    setSaving(true)
    setError('')
    try {
      const blob = await cropImage(imageUrl, pixels, rotation)
      await onSave(blob)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nao foi possivel recortar a foto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/75 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={`Editar ${imageName}`}>
      <div className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl sm:h-[min(760px,92vh)] sm:max-w-3xl sm:rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <header className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="min-w-0"><h2 className="font-semibold">Editar foto</h2><p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{imageName}</p></div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg" aria-label="Fechar"><X size={19} /></button>
        </header>

        <div className="relative min-h-0 flex-1 bg-black">
          <Cropper image={imageUrl} crop={crop} zoom={zoom} rotation={rotation} aspect={ratio} onCropChange={setCrop} onZoomChange={setZoom} onRotationChange={setRotation} onCropComplete={complete} showGrid objectFit="contain" />
        </div>

        <div className="space-y-3 p-4">
          <div className="flex gap-2 overflow-x-auto">
            {RATIOS.map(item => <button key={item.label} type="button" onClick={() => setRatio(item.value)} className="min-h-9 shrink-0 rounded-lg px-3 text-xs font-medium" style={{ border: `1px solid ${ratio === item.value ? 'var(--accent)' : 'var(--border)'}`, color: ratio === item.value ? 'var(--accent)' : 'var(--text-secondary)' }}>{item.label}</button>)}
          </div>
          <label className="grid grid-cols-[48px_1fr] items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}><span>Zoom</span><input type="range" min={1} max={3} step={0.05} value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
          <label className="grid grid-cols-[48px_1fr] items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}><span>Giro</span><input type="range" min={-180} max={180} step={1} value={rotation} onChange={event => setRotation(Number(event.target.value))} /></label>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0) }} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm" style={{ border: '1px solid var(--border)' }}><RotateCcw size={16} /> Restaurar</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>{saving ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />} Salvar recorte</button>
          </div>
        </div>
      </div>
    </div>
  )
}

async function cropImage(source: string, area: Area, rotation: number) {
  const image = await loadImage(source)
  const radians = rotation * Math.PI / 180
  const bounds = rotatedBounds(image.naturalWidth, image.naturalHeight, radians)
  const staging = document.createElement('canvas')
  staging.width = bounds.width
  staging.height = bounds.height
  const context = staging.getContext('2d')
  if (!context) throw new Error('Editor de imagem indisponivel neste navegador.')
  context.translate(bounds.width / 2, bounds.height / 2)
  context.rotate(radians)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  const output = document.createElement('canvas')
  output.width = area.width
  output.height = area.height
  const outputContext = output.getContext('2d')
  if (!outputContext) throw new Error('Editor de imagem indisponivel neste navegador.')
  outputContext.drawImage(staging, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  return new Promise<Blob>((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao gerar o recorte.')), 'image/jpeg', 0.9))
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Nao foi possivel abrir esta imagem para edicao.'))
    image.src = src
  })
}

function rotatedBounds(width: number, height: number, radians: number) {
  return {
    width: Math.round(Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height)),
    height: Math.round(Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height)),
  }
}
