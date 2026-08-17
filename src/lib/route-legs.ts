import type { Route } from "@/lib/route"
import type { LatLng } from "@/types/area"

/**
 * Máximo de posições por requisição da Directions: origem + 23 intermediários + destino.
 * Rotas maiores são quebradas em trechos consecutivos e o traçado é concatenado.
 */
export const MAX_LOCATIONS_PER_REQUEST = 25

/** Todas as posições da rota, na ordem em que serão percorridas. */
export function routeLocations(route: Route): LatLng[] {
  const stops = route.stops.map((stop) => ({ lat: stop.point.lat, lng: stop.point.lng }))
  const locations = route.origin ? [route.origin, ...stops] : stops

  if (route.roundTrip && locations.length > 1) {
    locations.push(route.origin ?? locations[0])
  }

  return locations
}

/**
 * Quebra em trechos de no máximo `MAX_LOCATIONS_PER_REQUEST` posições, repetindo a
 * última posição de cada trecho como primeira do seguinte — sem essa sobreposição, o
 * traçado ficaria com buracos entre um trecho e o outro.
 */
export function chunkLocations(locations: LatLng[]): LatLng[][] {
  if (locations.length <= MAX_LOCATIONS_PER_REQUEST) {
    return locations.length >= 2 ? [locations] : []
  }

  const chunks: LatLng[][] = []
  let start = 0

  while (start < locations.length - 1) {
    const end = Math.min(start + MAX_LOCATIONS_PER_REQUEST - 1, locations.length - 1)
    chunks.push(locations.slice(start, end + 1))
    start = end
  }

  return chunks
}
