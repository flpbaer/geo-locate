/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { Circle, DrawingManager, Polygon } from "@react-google-maps/api"
import { useCallback, useEffect, useRef, useState } from "react"

import { useAreas } from "@/components/areas/areas-provider"
import type { AreaPatch, CircleArea, LatLng, PolygonArea } from "@/types/area"

const ACTIVE_STROKE = "#2a78d6"
const IDLE_STROKE = "#94a3b8"

/** Tolerância de comparação geométrica: ~1 cm em graus, e 1 cm em metros. */
const EPSILON_DEGREES = 1e-7
const EPSILON_METERS = 0.01

function shapeOptions(isActive: boolean) {
  return {
    strokeColor: isActive ? ACTIVE_STROKE : IDLE_STROKE,
    strokeOpacity: isActive ? 0.9 : 0.55,
    strokeWeight: isActive ? 2 : 1.5,
    fillColor: isActive ? ACTIVE_STROKE : IDLE_STROKE,
    fillOpacity: isActive ? 0.12 : 0.06,
    clickable: true,
    zIndex: isActive ? 2 : 1,
  }
}

function sameLatLng(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < EPSILON_DEGREES && Math.abs(a.lng - b.lng) < EPSILON_DEGREES
}

function samePath(a: LatLng[], b: LatLng[]): boolean {
  return a.length === b.length && a.every((vertex, index) => sameLatLng(vertex, b[index]))
}

/**
 * Espera o gesto terminar antes de gravar. `center_changed`/`radius_changed` e os
 * eventos de path disparam a cada frame do arraste; sem isso, cada frame gravaria no
 * localStorage e recalcularia os insights da área inteira.
 */
function useDebouncedCommit(delay = 250) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return useCallback(
    (commit: () => void) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(commit, delay)
    },
    [delay],
  )
}

/** `onSelect`/`onCommit` recebem o id para que o pai passe funções estáveis: o effect de
 *  listeners do polígono depende da identidade do callback. */
interface ShapeProps<T> {
  area: T
  isActive: boolean
  onSelect: (id: string) => void
  onCommit: (id: string, geometry: Omit<AreaPatch, "name">) => void
}

function AreaCircleShape({ area, isActive, onSelect, onCommit }: ShapeProps<CircleArea>) {
  const instance = useRef<google.maps.Circle | null>(null)
  const schedule = useDebouncedCommit()

  // A guarda de igualdade evita o ciclo commit -> setCenter -> center_changed -> commit.
  const commit = useCallback(() => {
    schedule(() => {
      const circle = instance.current
      if (!circle) return

      const center = circle.getCenter()
      const radius = circle.getRadius()
      if (!center || !radius) return

      const next = { lat: center.lat(), lng: center.lng() }
      if (sameLatLng(next, area.center) && Math.abs(radius - area.radius) < EPSILON_METERS) return

      onCommit(area.id, { center: next, radius })
    })
  }, [schedule, onCommit, area.id, area.center, area.radius])

  return (
    <Circle
      center={area.center}
      radius={area.radius}
      editable={isActive}
      draggable={isActive}
      options={shapeOptions(isActive)}
      onLoad={(circle) => (instance.current = circle)}
      onUnmount={() => (instance.current = null)}
      onClick={() => onSelect(area.id)}
      onCenterChanged={commit}
      onRadiusChanged={commit}
    />
  )
}

function AreaPolygonShape({ area, isActive, onSelect, onCommit }: ShapeProps<PolygonArea>) {
  const [instance, setInstance] = useState<google.maps.Polygon | null>(null)
  const schedule = useDebouncedCommit()

  const commit = useCallback(
    (polygon: google.maps.Polygon) => {
      schedule(() => {
        const path = polygon
          .getPath()
          .getArray()
          .map((vertex) => ({ lat: vertex.lat(), lng: vertex.lng() }))

        if (path.length < 3 || samePath(path, area.path)) return

        onCommit(area.id, { path })
      })
    },
    [schedule, onCommit, area.id, area.path],
  )

  /**
   * O `onEdit` da lib só existe no componente funcional — na classe `Polygon` o prop é
   * ignorado em silêncio. E cada commit troca o path via `setPath`, criando um novo
   * MVCArray, então os listeners precisam ser reanexados a cada mudança de `area.path`.
   */
  useEffect(() => {
    if (!instance) return

    const path = instance.getPath()
    const handler = () => commit(instance)
    const listeners = [
      google.maps.event.addListener(path, "insert_at", handler),
      google.maps.event.addListener(path, "set_at", handler),
      google.maps.event.addListener(path, "remove_at", handler),
    ]

    return () => listeners.forEach((listener) => google.maps.event.removeListener(listener))
  }, [instance, commit, area.path])

  return (
    <Polygon
      path={area.path}
      editable={isActive}
      draggable={isActive}
      options={shapeOptions(isActive)}
      onLoad={setInstance}
      onUnmount={() => setInstance(null)}
      onClick={() => onSelect(area.id)}
      onDragEnd={() => instance && commit(instance)}
    />
  )
}

export function AreaOverlays() {
  const { areas, activeArea, drawingKind, createArea, selectArea, updateGeometry, cancelDrawing } = useAreas()

  // A forma criada pelo DrawingManager é descartada: quem desenha no mapa é o
  // <Circle>/<Polygon> controlado, alimentado pela área salva.
  const handleCircleComplete = useCallback(
    (circle: google.maps.Circle) => {
      const center = circle.getCenter()
      const radius = circle.getRadius()
      circle.setMap(null)

      if (!center || !radius) {
        cancelDrawing()
        return
      }

      createArea({ kind: "circle", center: { lat: center.lat(), lng: center.lng() }, radius })
    },
    [createArea, cancelDrawing],
  )

  const handlePolygonComplete = useCallback(
    (polygon: google.maps.Polygon) => {
      const path: LatLng[] = polygon
        .getPath()
        .getArray()
        .map((vertex) => ({ lat: vertex.lat(), lng: vertex.lng() }))
      polygon.setMap(null)

      if (path.length < 3) {
        cancelDrawing()
        return
      }

      createArea({ kind: "polygon", path })
    },
    [createArea, cancelDrawing],
  )

  return (
    <>
      {drawingKind && (
        <DrawingManager
          drawingMode={drawingKind as any}
          options={{
            drawingControl: false,
            circleOptions: shapeOptions(true),
            polygonOptions: shapeOptions(true),
          }}
          onCircleComplete={handleCircleComplete}
          onPolygonComplete={handlePolygonComplete}
        />
      )}

      {areas.map((area) =>
        area.kind === "circle" ? (
          <AreaCircleShape
            key={area.id}
            area={area}
            isActive={activeArea?.id === area.id}
            onSelect={selectArea}
            onCommit={updateGeometry}
          />
        ) : (
          <AreaPolygonShape
            key={area.id}
            area={area}
            isActive={activeArea?.id === area.id}
            onSelect={selectArea}
            onCommit={updateGeometry}
          />
        ),
      )}
    </>
  )
}
