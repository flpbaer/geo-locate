"use client"

import { Circle, Marker, Polyline, useGoogleMap } from "@react-google-maps/api"
import { useEffect, useRef } from "react"

import { useGps } from "@/components/gps/gps-provider"
import { useMapPoints } from "@/components/map-points-provider"
import { distanceInMeters } from "@/lib/geo"

const ME_COLOR = "#1a73e8"
const NEXT_COLOR = "#e34948"
const STOP_COLOR = "#475569"
const DONE_COLOR = "#1baf7a"
const SKIPPED_COLOR = "#94a3b8"

/** Zoom de navegação, aplicado ao entrar no modo se o mapa estiver mais afastado. */
const NAV_ZOOM = 15
const MIN_NAV_ZOOM = 14

/** Deslocamento mínimo para recentralizar — evita tremer o mapa com o ruído do GPS. */
const FOLLOW_MIN_MOVE_M = 25

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

/** Seta na direção do movimento; volta ao ponto quando o aparelho não informa o rumo. */
function meIcon(heading: number | null) {
  if (heading === null) return circleIcon(ME_COLOR, 8)

  return {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 6,
    rotation: heading,
    fillColor: ME_COLOR,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  }
}

function dashedLine(color: string) {
  return {
    strokeOpacity: 0,
    icons: [
      {
        icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: 0.9, strokeWeight: 4, scale: 1 },
        offset: "0",
        repeat: "12px",
      },
    ],
    clickable: false,
    zIndex: 8,
  }
}

const solidLine = {
  strokeColor: ME_COLOR,
  strokeOpacity: 0.9,
  strokeWeight: 5,
  clickable: false,
  zIndex: 8,
}

/**
 * Desenha o modo GPS no mapa: posição do aparelho, caminho até o próximo cliente e a
 * sequência recalculada. Também cuida da câmera, que só faz sentido junto do mapa.
 */
export function GpsOverlay() {
  const map = useGoogleMap()
  const { fix, route, nextStop, roadPath, followMode, setFollowMode, visitedPoints } = useGps()
  const { selectPoint } = useMapPoints()

  const hasCentered = useRef(false)
  const lastPanned = useRef<google.maps.LatLngLiteral | null>(null)

  // Entrar no modo enquadra o vendedor: sem isso o mapa continua onde estava.
  useEffect(() => {
    if (!map || !fix || hasCentered.current) return

    map.panTo(fix.position)
    if ((map.getZoom() ?? 0) < MIN_NAV_ZOOM) map.setZoom(NAV_ZOOM)
    hasCentered.current = true
    lastPanned.current = fix.position
  }, [map, fix])

  useEffect(() => {
    if (!map || !fix || !followMode || !hasCentered.current) return

    if (lastPanned.current && distanceInMeters(lastPanned.current, fix.position) < FOLLOW_MIN_MOVE_M) {
      return
    }

    map.panTo(fix.position)
    lastPanned.current = fix.position
  }, [map, fix, followMode])

  // Arrastar o mapa é intenção explícita de olhar outro lugar — o seguir se desliga
  // sozinho, em vez de puxar a câmera de volta no próximo fix.
  const followRef = useRef({ followMode, setFollowMode })
  followRef.current = { followMode, setFollowMode }

  useEffect(() => {
    if (!map) return

    const listener = map.addListener("dragstart", () => {
      if (followRef.current.followMode) followRef.current.setFollowMode(false)
    })

    return () => listener.remove()
  }, [map])

  if (!fix) return null

  const stops = route?.stops ?? []
  const nextTarget = nextStop ? { lat: nextStop.point.lat, lng: nextStop.point.lng } : null

  return (
    <>
      {/* A incerteza do fix fica visível: é ela que define o que conta como "cheguei". */}
      <Circle
        center={fix.position}
        radius={fix.accuracy}
        options={{
          strokeColor: ME_COLOR,
          strokeOpacity: 0.35,
          strokeWeight: 1,
          fillColor: ME_COLOR,
          fillOpacity: 0.12,
          clickable: false,
          zIndex: 3,
        }}
      />

      {nextTarget && (
        <Polyline
          path={roadPath ?? [fix.position, nextTarget]}
          options={roadPath ? solidLine : dashedLine(ME_COLOR)}
        />
      )}

      {/* Trechos seguintes em linha reta: a Directions é consultada só até o próximo. */}
      {stops.length > 1 && (
        <Polyline
          path={stops.map((stop) => ({ lat: stop.point.lat, lng: stop.point.lng }))}
          options={dashedLine(STOP_COLOR)}
        />
      )}

      {visitedPoints.map(({ point, status }) => (
        <Marker
          key={point.id}
          position={{ lat: point.lat, lng: point.lng }}
          title={`${point.name} — ${status === "done" ? "visitado" : "pulado"}`}
          zIndex={4}
          icon={circleIcon(status === "done" ? DONE_COLOR : SKIPPED_COLOR, 6)}
          onClick={() => selectPoint(point)}
        />
      ))}

      {stops.map((stop) => {
        const isNext = stop.order === 1

        return (
          <Marker
            key={stop.point.id}
            position={{ lat: stop.point.lat, lng: stop.point.lng }}
            title={`${stop.order}. ${stop.point.name}`}
            zIndex={isNext ? 7 : 5}
            label={{
              text: String(stop.order),
              color: "#ffffff",
              fontSize: isNext ? "12px" : "10px",
              fontWeight: "600",
            }}
            icon={circleIcon(isNext ? NEXT_COLOR : STOP_COLOR, isNext ? 13 : 10)}
            onClick={() => selectPoint(stop.point)}
          />
        )
      })}

      <Marker position={fix.position} title="Você está aqui" zIndex={9} icon={meIcon(fix.heading)} />
    </>
  )
}
