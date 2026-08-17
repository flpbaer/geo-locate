"use client"

import { Circle, Polygon } from "@react-google-maps/api"
import { useCallback, useEffect, useRef, useState } from "react"

import { AreaDrawing } from "@/components/areas/area-drawing"
import { useAreas } from "@/components/areas/areas-provider"
import { RouteOverlay } from "@/components/areas/route-overlay"
import { resolveAreaStyle } from "@/lib/area-style"
import type { AreaPatch, AreaStyle, CircleArea, LatLng, PolygonArea } from "@/types/area"

/** Tolerância de comparação geométrica: ~1 cm em graus, e 1 cm em metros. */
const EPSILON_DEGREES = 1e-7
const EPSILON_METERS = 0.01

/**
 * A cor identifica a área e não muda com a seleção — o destaque da área ativa vem de
 * borda mais grossa e preenchimento mais forte, para que cada território mantenha sua
 * identidade visual mesmo quando outro está selecionado.
 *
 * `isDrawing` desliga o clique nas formas existentes: durante o desenho elas
 * engoliriam os cliques destinados ao mapa.
 */
function shapeOptions(style: AreaStyle, isActive: boolean, isDrawing = false) {
  return {
    strokeColor: style.strokeColor,
    strokeOpacity: isActive ? 1 : 0.7,
    strokeWeight: isActive ? style.strokeWeight + 1 : style.strokeWeight,
    fillColor: style.fillColor,
    fillOpacity: isActive ? style.fillOpacity : style.fillOpacity * 0.55,
    clickable: !isDrawing,
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
  isDrawing: boolean
  onSelect: (id: string) => void
  onCommit: (id: string, geometry: Omit<AreaPatch, "name">) => void
}

function AreaCircleShape({ area, isActive, isDrawing, onSelect, onCommit }: ShapeProps<CircleArea>) {
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
      editable={isActive && !isDrawing}
      draggable={isActive && !isDrawing}
      options={shapeOptions(resolveAreaStyle(area), isActive, isDrawing)}
      onLoad={(circle) => (instance.current = circle)}
      onUnmount={() => (instance.current = null)}
      onClick={() => onSelect(area.id)}
      onCenterChanged={commit}
      onRadiusChanged={commit}
    />
  )
}

function AreaPolygonShape({ area, isActive, isDrawing, onSelect, onCommit }: ShapeProps<PolygonArea>) {
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
      editable={isActive && !isDrawing}
      draggable={isActive && !isDrawing}
      options={shapeOptions(resolveAreaStyle(area), isActive, isDrawing)}
      onLoad={setInstance}
      onUnmount={() => setInstance(null)}
      onClick={() => onSelect(area.id)}
      onDragEnd={() => instance && commit(instance)}
    />
  )
}

export function AreaOverlays() {
  const { areas, activeArea, drawingKind, isPickingOrigin, selectArea, updateGeometry } = useAreas()

  // Escolher a origem também captura cliques do mapa: as formas não podem interceptá-los.
  const isDrawing = drawingKind !== null || isPickingOrigin

  return (
    <>
      {drawingKind && <AreaDrawing key={drawingKind} />}
      <RouteOverlay />

      {areas.map((area) =>
        area.kind === "circle" ? (
          <AreaCircleShape
            key={area.id}
            area={area}
            isActive={activeArea?.id === area.id}
            isDrawing={isDrawing}
            onSelect={selectArea}
            onCommit={updateGeometry}
          />
        ) : (
          <AreaPolygonShape
            key={area.id}
            area={area}
            isActive={activeArea?.id === area.id}
            isDrawing={isDrawing}
            onSelect={selectArea}
            onCommit={updateGeometry}
          />
        ),
      )}
    </>
  )
}
