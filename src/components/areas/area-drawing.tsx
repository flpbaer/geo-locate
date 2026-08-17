"use client"

import { Circle, Marker, Polygon, Polyline, useGoogleMap } from "@react-google-maps/api"
import { useCallback, useEffect, useRef, useState } from "react"

import { distanceInMeters } from "@/lib/geo"
import type { AreaDraft, AreaKind, LatLng } from "@/types/area"

const PREVIEW_STROKE = "#2a78d6"

/** Distância, em pixels de tela, para um clique contar como "no primeiro vértice". */
const CLOSE_HANDLE_PIXELS = 14

/** Marcadores de apoio não podem engolir o clique destinado ao mapa. */
const passthroughMarker = { clickable: false }

const previewOptions = {
  strokeColor: PREVIEW_STROKE,
  strokeOpacity: 0.9,
  strokeWeight: 2,
  fillColor: PREVIEW_STROKE,
  fillOpacity: 0.12,
  clickable: false,
  zIndex: 3,
}

/** Escala do mapa na latitude e zoom atuais — usada para o alvo de fechamento em pixels. */
function metersPerPixel(lat: number, zoom: number): number {
  return (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

function toLatLng(event: google.maps.MapMouseEvent): LatLng | null {
  if (!event.latLng) return null
  return { lat: event.latLng.lat(), lng: event.latLng.lng() }
}

interface AreaDrawingProps {
  kind: AreaKind
  onComplete: (draft: AreaDraft) => void
  onCancel: () => void
}

/**
 * Captura do desenho feita à mão, com listeners do mapa.
 *
 * O `DrawingManager` da Maps JavaScript API foi removido na v3.65 (Drawing Library
 * descontinuada em ago/2025, indisponível desde mai/2026). `Circle` e `Polygon` são
 * overlays do core e seguem valendo — só a captura do gesto precisou ser reescrita.
 *
 * Círculo: clique define o centro, segundo clique define o raio.
 * Polígono: cliques marcam vértices; fecha no primeiro vértice ou com Enter.
 * Esc cancela nos dois casos.
 */
export function AreaDrawing({ kind, onComplete, onCancel }: AreaDrawingProps) {
  const map = useGoogleMap()

  // Refs espelham o estado para que os listeners fiquem anexados uma única vez: o
  // cursor muda a cada mousemove e reanexar listeners nesse ritmo seria custoso.
  const centerRef = useRef<LatLng | null>(null)
  const verticesRef = useRef<LatLng[]>([])

  const [center, setCenter] = useState<LatLng | null>(null)
  const [vertices, setVertices] = useState<LatLng[]>([])
  const [cursor, setCursor] = useState<LatLng | null>(null)

  const completeRef = useRef(onComplete)
  const cancelRef = useRef(onCancel)
  completeRef.current = onComplete
  cancelRef.current = onCancel

  const finishPolygon = useCallback(() => {
    if (verticesRef.current.length < 3) return
    completeRef.current({ kind: "polygon", path: verticesRef.current })
  }, [])

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

      if (kind === "circle") {
        if (!centerRef.current) {
          centerRef.current = point
          setCenter(point)
          return
        }

        const radius = distanceInMeters(centerRef.current, point)
        if (radius <= 0) return

        completeRef.current({ kind: "circle", center: centerRef.current, radius })
        return
      }

      const first = verticesRef.current[0]

      if (first && verticesRef.current.length >= 3) {
        const zoom = map.getZoom() ?? 10
        const threshold = CLOSE_HANDLE_PIXELS * metersPerPixel(point.lat, zoom)

        if (distanceInMeters(point, first) <= threshold) {
          finishPolygon()
          return
        }
      }

      verticesRef.current = [...verticesRef.current, point]
      setVertices(verticesRef.current)
    }

    const handleMouseMove = (event: google.maps.MapMouseEvent) => {
      const point = toLatLng(event)
      if (point) setCursor(point)
    }

    const listeners = [
      map.addListener("click", handleClick),
      map.addListener("mousemove", handleMouseMove),
    ]

    return () => listeners.forEach((listener) => listener.remove())
  }, [map, kind, finishPolygon])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        cancelRef.current()
      }
      if (event.key === "Enter" && kind === "polygon") {
        event.preventDefault()
        finishPolygon()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [kind, finishPolygon])

  if (kind === "circle") {
    if (!center) return null

    const radius = cursor ? distanceInMeters(center, cursor) : 0

    return (
      <>
        <Marker position={center} options={passthroughMarker} />
        {radius > 0 && <Circle center={center} radius={radius} options={previewOptions} />}
      </>
    )
  }

  if (vertices.length === 0) return null

  // Enquanto tem menos de 3 vértices, só a linha faz sentido; depois o preenchimento
  // mostra a área que será criada.
  const trail = cursor ? [...vertices, cursor] : vertices

  return (
    <>
      {vertices.length >= 3 ? (
        <Polygon path={trail} options={previewOptions} />
      ) : (
        <Polyline path={trail} options={previewOptions} />
      )}
      <Marker position={vertices[0]} options={passthroughMarker} title="Clique aqui para fechar a área" />
    </>
  )
}
