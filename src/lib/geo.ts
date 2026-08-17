import type { Area, LatLng, PolygonArea } from "@/types/area"

const EARTH_RADIUS_M = 6_371_008.8

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/**
 * Distância em metros entre dois pontos (haversine).
 *
 * Cálculo próprio em vez de `google.maps.geometry.spherical` para que o filtro de
 * área e o cálculo de rota funcionem sem depender do script do Maps ter carregado.
 */
export function distanceInMeters(from: LatLng, to: LatLng): number {
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLat = lat2 - lat1
  const deltaLng = toRadians(to.lng - from.lng)

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Ray casting no plano lat/lng — precisão suficiente nas escalas de cidade/estado. */
export function isInsidePolygon(point: LatLng, path: LatLng[]): boolean {
  if (path.length < 3) return false

  let inside = false

  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const yi = path[i].lat
    const xi = path[i].lng
    const yj = path[j].lat
    const xj = path[j].lng

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi

    if (intersects) inside = !inside
  }

  return inside
}

export function isInsideArea(point: LatLng, area: Area): boolean {
  if (area.kind === "circle") {
    return distanceInMeters(area.center, point) <= area.radius
  }
  return isInsidePolygon(point, area.path)
}

/** Centro do círculo, ou centroide do polígono (usado para enquadrar o mapa e medir dispersão). */
export function areaCenter(area: Area): LatLng {
  if (area.kind === "circle") return area.center
  if (area.path.length === 0) return { lat: 0, lng: 0 }

  const sum = area.path.reduce(
    (acc, vertex) => ({ lat: acc.lat + vertex.lat, lng: acc.lng + vertex.lng }),
    { lat: 0, lng: 0 },
  )

  return { lat: sum.lat / area.path.length, lng: sum.lng / area.path.length }
}

/** Área esférica de um polígono em km², pelo excesso esférico. */
function polygonAreaKm2(area: PolygonArea): number {
  const path = area.path
  if (path.length < 3) return 0

  let total = 0

  for (let i = 0; i < path.length; i++) {
    const current = path[i]
    const next = path[(i + 1) % path.length]
    total +=
      toRadians(next.lng - current.lng) * (2 + Math.sin(toRadians(current.lat)) + Math.sin(toRadians(next.lat)))
  }

  const squareMeters = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
  return squareMeters / 1_000_000
}

export function areaSizeKm2(area: Area): number {
  if (area.kind === "circle") {
    return (Math.PI * area.radius * area.radius) / 1_000_000
  }
  return polygonAreaKm2(area)
}

/** Bounds da área, para enquadrar o mapa. */
export function areaBounds(area: Area): { north: number; south: number; east: number; west: number } {
  if (area.kind === "circle") {
    // Grau de latitude é ~constante; longitude encurta com o cosseno da latitude.
    const latDelta = (area.radius / EARTH_RADIUS_M) * (180 / Math.PI)
    const cosLat = Math.max(Math.cos(toRadians(area.center.lat)), 1e-6)
    const lngDelta = latDelta / cosLat

    return {
      north: area.center.lat + latDelta,
      south: area.center.lat - latDelta,
      east: area.center.lng + lngDelta,
      west: area.center.lng - lngDelta,
    }
  }

  const lats = area.path.map((vertex) => vertex.lat)
  const lngs = area.path.map((vertex) => vertex.lng)

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters).toLocaleString("pt-BR")} m`
  }
  return `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`
}

export function formatAreaKm2(km2: number): string {
  const digits = km2 < 10 ? 1 : 0
  return `${km2.toLocaleString("pt-BR", { maximumFractionDigits: digits })} km²`
}
