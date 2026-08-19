"use client"

import { Circle, Marker, Polygon, Polyline, useGoogleMap } from "@react-google-maps/api"
import { useEffect, useRef } from "react"

import { useAreas } from "@/components/areas/areas-provider"
import { distanceInMeters } from "@/lib/geo"
import type { AreaStyle, LatLng } from "@/types/area"

/** Distância, em pixels de tela, para um clique contar como "no primeiro vértice". */
const CLOSE_HANDLE_PIXELS = 14

/** Marcadores de apoio não podem engolir o clique destinado ao mapa. */
const passthroughMarker = { clickable: false }

/** O preview já usa a cor que a área vai receber ao ser criada. */
function previewOptions(style: AreaStyle) {
  return {
    strokeColor: style.strokeColor,
    strokeOpacity: 0.9,
    strokeWeight: style.strokeWeight,
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity,
    clickable: false,
    zIndex: 3,
  }
}

/** Escala do mapa na latitude e zoom atuais — usada para o alvo de fechamento em pixels. */
function metersPerPixel(lat: number, zoom: number): number {
  return (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

function toLatLng(event: google.maps.MapMouseEvent): LatLng | null {
  if (!event.latLng) return null
  return { lat: event.latLng.lat(), lng: event.latLng.lng() }
}

/** Ignora atalhos enquanto o foco está num campo de texto (ex.: renomear área). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

/**
 * Captura do desenho feita à mão, com listeners do mapa.
 *
 * O `DrawingManager` da Maps JavaScript API foi removido na v3.65 (Drawing Library
 * descontinuada em ago/2025, indisponível desde mai/2026). `Circle` e `Polygon` são
 * overlays do core e seguem valendo — só a captura do gesto precisou ser reescrita.
 *
 * Os pontos marcados e o cursor vivem no AreasProvider: a toolbar precisa deles para
 * desfazer/concluir e para contar, e o mapa para destacar os clientes que a forma já pega.
 */
export function AreaDrawing() {
  const map = useGoogleMap()
  const {
    draft,
    draftCursor,
    setDraftCursor,
    draftGeometry,
    draftStyle,
    addDraftPoint,
    undoDraftPoint,
    finishDraft,
    cancelDrawing,
  } = useAreas()

  // Os listeners são anexados uma única vez; o ref dá acesso ao estado mais recente
  // sem reanexar a cada ponto marcado.
  const latest = useRef({ draft, addDraftPoint, undoDraftPoint, finishDraft, cancelDrawing })
  latest.current = { draft, addDraftPoint, undoDraftPoint, finishDraft, cancelDrawing }

  /**
   * O cursor sai daqui para o provider, e de lá o destaque dos clientes é recalculado —
   * mousemove dispara várias vezes por frame, então cada posição espera o próximo frame
   * em vez de arrastar a base inteira atrás de si.
   */
  const pendingCursor = useRef<LatLng | null>(null)
  const cursorFrame = useRef<number | null>(null)

  // Cursor de precisão, e sem zoom no duplo clique — que atrapalharia marcar vértices.
  useEffect(() => {
    if (!map) return

    map.setOptions({ draggableCursor: "crosshair", disableDoubleClickZoom: true })
    return () => map.setOptions({ draggableCursor: undefined, disableDoubleClickZoom: false })
  }, [map])

  useEffect(() => {
    if (!map) return

    const handleClick = (event: google.maps.MapMouseEvent) => {
      const point = toLatLng(event)
      if (!point) return

      const current = latest.current.draft
      const first = current?.vertices[0]

      // Clicar sobre o primeiro vértice fecha o polígono em vez de marcar outro ponto.
      if (current?.kind === "polygon" && first && current.vertices.length >= 3) {
        const threshold = CLOSE_HANDLE_PIXELS * metersPerPixel(point.lat, map.getZoom() ?? 10)

        if (distanceInMeters(point, first) <= threshold) {
          latest.current.finishDraft()
          return
        }
      }

      latest.current.addDraftPoint(point)
    }

    const handleMouseMove = (event: google.maps.MapMouseEvent) => {
      const point = toLatLng(event)
      if (!point) return

      pendingCursor.current = point
      if (cursorFrame.current !== null) return

      cursorFrame.current = requestAnimationFrame(() => {
        cursorFrame.current = null
        if (pendingCursor.current) setDraftCursor(pendingCursor.current)
      })
    }

    const listeners = [
      map.addListener("click", handleClick),
      map.addListener("mousemove", handleMouseMove),
    ]

    return () => {
      listeners.forEach((listener) => listener.remove())
      if (cursorFrame.current !== null) cancelAnimationFrame(cursorFrame.current)
      cursorFrame.current = null
    }
  }, [map, setDraftCursor])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        latest.current.undoDraftPoint()
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        latest.current.cancelDrawing()
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        latest.current.finishDraft()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  if (!draft) return null

  if (draft.kind === "circle") {
    if (!draft.center) return null

    return (
      <>
        <Marker position={draft.center} options={passthroughMarker} />
        {draftGeometry?.kind === "circle" && (
          <Circle
            center={draftGeometry.center}
            radius={draftGeometry.radius}
            options={previewOptions(draftStyle)}
          />
        )}
      </>
    )
  }

  if (draft.vertices.length === 0) return null

  // Com menos de 3 vértices só a linha faz sentido; depois o preenchimento mostra a
  // área que será criada.
  const trail = draftCursor ? [...draft.vertices, draftCursor] : draft.vertices

  return (
    <>
      {draft.vertices.length >= 3 ? (
        <Polygon path={trail} options={previewOptions(draftStyle)} />
      ) : (
        <Polyline path={trail} options={previewOptions(draftStyle)} />
      )}
      {draft.vertices.map((vertex, index) => (
        <Marker
          key={`${vertex.lat},${vertex.lng},${index}`}
          position={vertex}
          options={passthroughMarker}
          title={index === 0 ? "Clique aqui para fechar a área" : undefined}
        />
      ))}
    </>
  )
}
