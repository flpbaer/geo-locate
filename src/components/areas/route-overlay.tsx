"use client"

import { Marker, Polyline, useGoogleMap } from "@react-google-maps/api"
import { useEffect, useRef } from "react"

import { useAreas } from "@/components/areas/areas-provider"
import { useRoadPath } from "@/components/areas/use-road-path"
import { useMapPoints } from "@/components/map-points-provider"
import { resolveAreaStyle } from "@/lib/area-style"
import type { LatLng } from "@/types/area"

const ORIGIN_COLOR = "#0b0b0b"

/**
 * Tracejado sinaliza que a linha é distância em linha reta, não caminho por ruas.
 * O Google Maps não tem `strokeDashArray`: o traço vem de um símbolo repetido sobre uma
 * linha de opacidade zero.
 */
function dashedLine(color: string) {
  return {
    strokeColor: color,
    strokeOpacity: 0,
    strokeWeight: 4,
    icons: [
      {
        icon: {
          path: "M 0,-1 0,1",
          strokeColor: color,
          strokeOpacity: 0.85,
          strokeWeight: 4,
          scale: 1,
        },
        offset: "0",
        repeat: "12px",
      },
    ],
    clickable: false,
    zIndex: 4,
  }
}

function solidLine(color: string) {
  return {
    strokeColor: color,
    strokeOpacity: 0.9,
    strokeWeight: 4,
    clickable: false,
    zIndex: 4,
  }
}

function circleIcon(fillColor: string, scale: number) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  }
}

/** Define a origem da rota no próximo clique do mapa. Esc cancela. */
function OriginPicker() {
  const map = useGoogleMap()
  const { setRouteOrigin, cancelPickingOrigin } = useAreas()

  const latest = useRef({ setRouteOrigin, cancelPickingOrigin })
  latest.current = { setRouteOrigin, cancelPickingOrigin }

  useEffect(() => {
    if (!map) return

    map.setOptions({ draggableCursor: "crosshair" })
    return () => map.setOptions({ draggableCursor: undefined })
  }, [map])

  useEffect(() => {
    if (!map) return

    const listener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return
      latest.current.setRouteOrigin({ lat: event.latLng.lat(), lng: event.latLng.lng() })
    })

    return () => listener.remove()
  }, [map])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        latest.current.cancelPickingOrigin()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return null
}

export function RouteOverlay() {
  const { activeArea, activeRoute, routeSettings, isPickingOrigin } = useAreas()
  const { selectPoint } = useMapPoints()

  const style = resolveAreaStyle(activeArea)
  const { path: roadPath, error } = useRoadPath(activeRoute, routeSettings.useRoads)

  if (isPickingOrigin) {
    return (
      <>
        <OriginPicker />
        {routeSettings.origin && <Marker position={routeSettings.origin} title="Ponto de partida atual" />}
      </>
    )
  }

  if (!activeRoute || activeRoute.stops.length === 0) return null

  const stopCoords: LatLng[] = activeRoute.stops.map((stop) => ({ lat: stop.point.lat, lng: stop.point.lng }))

  // Enquanto o traçado por ruas não chega (ou falha), a linha reta já mostra a sequência.
  const straightPath: LatLng[] = [
    ...(routeSettings.origin ? [routeSettings.origin] : []),
    ...stopCoords,
    ...(activeRoute.roundTrip ? [routeSettings.origin ?? stopCoords[0]] : []),
  ]

  const usingRoads = roadPath !== null && !error
  const path = usingRoads ? roadPath : straightPath

  return (
    <>
      <Polyline path={path} options={usingRoads ? solidLine(style.strokeColor) : dashedLine(style.strokeColor)} />

      {routeSettings.origin && (
        <Marker
          position={routeSettings.origin}
          title="Ponto de partida"
          zIndex={6}
          icon={circleIcon(ORIGIN_COLOR, 7)}
        />
      )}

      {activeRoute.stops.map((stop) => (
        <Marker
          key={stop.point.id}
          position={{ lat: stop.point.lat, lng: stop.point.lng }}
          title={`${stop.order}. ${stop.point.name}`}
          zIndex={5}
          label={{ text: String(stop.order), color: "#ffffff", fontSize: "11px", fontWeight: "600" }}
          icon={circleIcon(style.strokeColor, 11)}
          onClick={() => selectPoint(stop.point)}
        />
      ))}
    </>
  )
}
