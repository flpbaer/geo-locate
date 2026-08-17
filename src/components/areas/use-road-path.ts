"use client"

import { useEffect, useState } from "react"

import type { Route } from "@/lib/route"
import { chunkLocations, routeLocations } from "@/lib/route-legs"
import type { LatLng } from "@/types/area"

interface RoadPathState {
  path: LatLng[] | null
  isLoading: boolean
  error: string | null
}

const IDLE: RoadPathState = { path: null, isLoading: false, error: null }

function requestLeg(
  service: google.maps.DirectionsService,
  locations: LatLng[],
): Promise<google.maps.LatLng[]> {
  const [origin, ...rest] = locations
  const destination = rest[rest.length - 1]
  const waypoints = rest.slice(0, -1).map((location) => ({ location, stopover: true }))

  return new Promise((resolve, reject) => {
    service.route(
      {
        origin,
        destination,
        waypoints,
        // A ordem já vem definida pelo nosso solver — o Google não deve reordenar.
        optimizeWaypoints: false,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          resolve(result.routes[0]?.overview_path ?? [])
        } else {
          reject(new Error(String(status)))
        }
      },
    )
  })
}

/**
 * Busca o traçado real por ruas da rota já ordenada.
 *
 * A ordenação é nossa (grátis, sem limite de paradas); a Directions entra só para
 * desenhar o caminho pelas ruas — por isso é opcional, já que cobra por requisição.
 */
export function useRoadPath(route: Route | null, enabled: boolean): RoadPathState {
  const [state, setState] = useState<RoadPathState>(IDLE)

  // A chave evita refazer as requisições quando só a identidade do objeto muda.
  const routeKey = route
    ? JSON.stringify([route.origin, route.roundTrip, route.stops.map((stop) => stop.point.id)])
    : null

  useEffect(() => {
    if (!enabled || !route || route.stops.length === 0) {
      setState(IDLE)
      return
    }

    if (typeof google === "undefined" || !google.maps?.DirectionsService) {
      setState({ path: null, isLoading: false, error: "Directions indisponível." })
      return
    }

    let cancelled = false
    setState({ path: null, isLoading: true, error: null })

    const service = new google.maps.DirectionsService()
    const chunks = chunkLocations(routeLocations(route))

    // Sequencial de propósito: em paralelo, uma rota longa dispara dezenas de
    // requisições de uma vez e leva OVER_QUERY_LIMIT.
    const run = async () => {
      const path: LatLng[] = []

      for (const chunk of chunks) {
        if (chunk.length < 2) continue

        const leg = await requestLeg(service, chunk)
        if (cancelled) return

        leg.forEach((position) => path.push({ lat: position.lat(), lng: position.lng() }))
      }

      if (!cancelled) setState({ path, isLoading: false, error: null })
    }

    run().catch((error: unknown) => {
      if (cancelled) return

      const status = error instanceof Error ? error.message : "erro desconhecido"
      setState({
        path: null,
        isLoading: false,
        error:
          status === "REQUEST_DENIED"
            ? "Directions API não habilitada nesta chave — mostrando linha reta."
            : `Não foi possível traçar por ruas (${status}) — mostrando linha reta.`,
      })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, routeKey])

  return state
}
