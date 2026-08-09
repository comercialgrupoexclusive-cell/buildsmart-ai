'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Viewer, events as viewerEvents } from '@photo-sphere-viewer/core'
import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin'
import { MarkersPlugin, events as markerEvents } from '@photo-sphere-viewer/markers-plugin'
import { VirtualTourPlugin, events as tourEvents, type VirtualTourNode } from '@photo-sphere-viewer/virtual-tour-plugin'
import { MapPinPlus, X } from 'lucide-react'
import type { PortalTourDTO, PortalTourPosition } from '@/lib/portal/types'
import '@photo-sphere-viewer/core/index.css'
import '@photo-sphere-viewer/gallery-plugin/index.css'
import '@photo-sphere-viewer/markers-plugin/index.css'
import '@photo-sphere-viewer/virtual-tour-plugin/index.css'

type Props = {
  tour: PortalTourDTO
  initialNodeId?: string
  initialYaw?: number
  initialPitch?: number
  onCreateAnnotation: (position: PortalTourPosition) => void
  onOpenBoardItem: (itemId: string) => void
}

function safeText(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}

export function BuildSmartTourViewer({ tour, initialNodeId, initialYaw, initialPitch, onCreateAnnotation, onOpenBoardItem }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const openBoardItemRef = useRef(onOpenBoardItem)
  useEffect(() => { openBoardItemRef.current = onOpenBoardItem }, [onOpenBoardItem])
  const [currentNodeId, setCurrentNodeId] = useState(initialNodeId || tour.nodes[0]?.id || '')
  const [pending, setPending] = useState<{ yaw: number; pitch: number } | null>(null)
  const currentNode = tour.nodes.find(node => node.id === currentNodeId) || tour.nodes[0]
  const initialNode = tour.nodes.find(node => node.id === initialNodeId) || tour.nodes[0]

  const nodes = useMemo<VirtualTourNode[]>(() => tour.nodes.map(node => ({
    id: node.id,
    name: node.nome,
    caption: node.nome,
    description: [node.pavimento, node.ambiente].filter(Boolean).join(' · '),
    panorama: node.imagemUrl,
    thumbnail: node.thumbnailUrl || node.imagemUrl,
    data: { ambiente: node.ambiente },
    links: node.links.map(link => ({
      nodeId: link.nodeDestinoId,
      position: { yaw: Number(link.yaw), pitch: Number(link.pitch) },
      data: { label: link.label },
    })),
    markers: node.hotspots.map(hotspot => ({
      id: `hotspot:${hotspot.id}`,
      position: { yaw: Number(hotspot.yaw), pitch: Number(hotspot.pitch) },
      circle: 18,
      svgStyle: { fill: hotspot.boardItemId ? '#3B7BF8' : '#F59E0B', stroke: '#ffffff', strokeWidth: '3px' },
      tooltip: safeText(hotspot.titulo),
      data: { boardItemId: hotspot.boardItemId },
    })),
  })), [tour.nodes])

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return
    let viewer: Viewer | null = null
    // Evita inicializar WebGL na primeira montagem descartada pelo Strict Mode.
    const timer = window.setTimeout(() => {
      if (!containerRef.current) return
      viewer = new Viewer({
        container: containerRef.current,
        panorama: nodes[0].panorama,
        navbar: ['zoom', 'move', 'gallery', 'fullscreen'],
        defaultYaw: initialYaw ?? Number(initialNode?.yawInicial || 0),
        defaultPitch: initialPitch ?? Number(initialNode?.pitchInicial || 0),
        plugins: [
          MarkersPlugin,
          GalleryPlugin,
          [VirtualTourPlugin, {
            dataMode: 'client', positionMode: 'manual', renderMode: '3d', showLinkTooltip: true,
          }],
        ],
      })

      const virtualTour = viewer.getPlugin<VirtualTourPlugin>(VirtualTourPlugin)
      virtualTour.addEventListener(tourEvents.NodeChangedEvent.type, event => setCurrentNodeId(event.node.id))
      viewer.addEventListener(viewerEvents.ReadyEvent.type, () => {
        virtualTour.setNodes(nodes, initialNodeId || nodes[0].id)
      }, { once: true })
      const markers = viewer.getPlugin<MarkersPlugin>(MarkersPlugin)
      markers.addEventListener(markerEvents.SelectMarkerEvent.type, event => {
        const boardItemId = event.marker.data?.boardItemId as string | undefined
        if (boardItemId) openBoardItemRef.current(boardItemId)
      })
      viewer.addEventListener(viewerEvents.ClickEvent.type, event => setPending({ yaw: event.data.yaw, pitch: event.data.pitch }))
    }, 0)

    return () => { window.clearTimeout(timer); viewer?.destroy() }
  }, [initialNode?.pitchInicial, initialNode?.yawInicial, initialNodeId, initialPitch, initialYaw, nodes])

  if (!currentNode || nodes.length === 0) return null

  return (
    <div className="relative overflow-hidden rounded-lg bg-[#111]" style={{ minHeight: 430 }}>
      <div ref={containerRef} className="h-[min(68vh,680px)] min-h-[430px] w-full" />

      {pending && (
        <div className="absolute left-3 right-3 bottom-14 flex items-center gap-2 rounded-lg bg-white p-2 shadow-xl sm:left-auto sm:w-auto">
          <button
            type="button"
            onClick={() => {
              onCreateAnnotation({ nodeId: currentNode.id, ambiente: currentNode.ambiente, yaw: pending.yaw, pitch: pending.pitch })
              setPending(null)
            }}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white"
          >
            <MapPinPlus size={18} /> Criar anotação aqui
          </button>
          <button type="button" onClick={() => setPending(null)} className="grid size-11 place-items-center rounded-lg border border-[var(--border)]" aria-label="Cancelar ponto"><X size={18} /></button>
        </div>
      )}
    </div>
  )
}
