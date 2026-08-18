"use client"

import { useEffect, useRef, useState } from "react"

import type { LatLng } from "@/types/area"

/** De quanto em quanto tempo a previsão é renovada, para acompanhar o trânsito. */
const REFRESH_INTERVAL_MS = 90_000

export interface DrivingEta {
  /** Duração da viagem em segundos. */
  seconds: number
  /** Distância por ruas em metros — maior que a linha reta. */
  meters: number
  /** `true` quando a duração já considera o trânsito do momento. */
  inTraffic: boolean
  /** Traçado por ruas até o destino, para desenhar no mapa. */
  path: LatLng[]
}

interface DrivingEtaState {
  eta: DrivingEta | null
  isLoading: boolean
  error: string | null
}

const IDLE: DrivingEtaState = { eta: null, isLoading: false, error: null }

function readResult(result: google.maps.DirectionsResult, inTraffic: boolean): DrivingEta | null {
  const leg = result.routes[0]?.legs[0]
  if (!leg) return null

  const duration = leg.duration_in_traffic ?? leg.duration

  return {
    seconds: duration?.value ?? 0,
    meters: leg.distance?.value ?? 0,
    inTraffic: inTraffic && leg.duration_in_traffic !== undefined,
    path: (result.routes[0].overview_path ?? []).map((position) => ({
      lat: position.lat(),
      lng: position.lng(),
    })),
  }
}

function request(
  service: google.maps.DirectionsService,
  origin: LatLng,
  destination: LatLng,
  withTraffic: boolean,
): Promise<google.maps.DirectionsResult> {
  return new Promise((resolve, reject) => {
    service.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        // `duration_in_traffic` só vem quando há hora de partida.
        ...(withTraffic
          ? {
              drivingOptions: {
                departureTime: new Date(),
                trafficModel: google.maps.TrafficModel.BEST_GUESS,
              },
            }
          : {}),
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) resolve(result)
        else reject(new Error(String(status)))
      },
    )
  })
}

/**
 * Previsão de chegada ao próximo cliente pela Directions, com trânsito.
 *
 * `from` deve ser a posição ancorada (não o fix cru), senão cada leitura do GPS viraria
 * uma requisição cobrada. Fora disso, só o relógio de renovação dispara consultas novas.
 */
export function useDrivingEta(from: LatLng | null, to: LatLng | null, enabled: boolean): DrivingEtaState {
  const [state, setState] = useState<DrivingEtaState>(IDLE)
  const [tick, setTick] = useState(0)
  const lastTarget = useRef<string | null>(null)

  // Coordenadas viram chave: `from`/`to` são objetos novos a cada render, e usá-los como
  // dependência reiniciaria o relógio de renovação antes de ele chegar a disparar.
  const fromKey = from ? `${from.lat},${from.lng}` : null
  const toKey = to ? `${to.lat},${to.lng}` : null

  useEffect(() => {
    if (!enabled || !fromKey || !toKey) return

    const timer = setInterval(() => setTick((current) => current + 1), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [enabled, fromKey, toKey])

  useEffect(() => {
    if (!enabled || !fromKey || !toKey) {
      setState(IDLE)
      return
    }

    if (typeof google === "undefined" || !google.maps?.DirectionsService) {
      setState({ eta: null, isLoading: false, error: "Directions indisponível." })
      return
    }

    const [fromLat, fromLng] = fromKey.split(",").map(Number)
    const [toLat, toLng] = toKey.split(",").map(Number)

    let cancelled = false

    // Renovar a previsão do mesmo destino mantém o número anterior na tela enquanto a
    // resposta vem; trocar de destino zera, senão a previsão do cliente anterior
    // apareceria como se fosse do novo.
    const isSameTarget = lastTarget.current === toKey
    lastTarget.current = toKey

    setState((current) =>
      isSameTarget ? { ...current, isLoading: true, error: null } : { eta: null, isLoading: true, error: null },
    )

    const service = new google.maps.DirectionsService()
    const origin = { lat: fromLat, lng: fromLng }
    const destination = { lat: toLat, lng: toLng }

    const run = async () => {
      let inTraffic = true
      let result: google.maps.DirectionsResult

      try {
        result = await request(service, origin, destination, true)
      } catch (error) {
        // Chaves sem permissão para trânsito recusam `drivingOptions`; a rota sem
        // trânsito ainda é bem melhor que a estimativa em linha reta.
        if (cancelled) return
        inTraffic = false
        result = await request(service, origin, destination, false)
        void error
      }

      if (cancelled) return

      const eta = readResult(result, inTraffic)
      setState({ eta, isLoading: false, error: eta ? null : "Sem trajeto até o cliente." })
    }

    run().catch((error: unknown) => {
      if (cancelled) return

      const status = error instanceof Error ? error.message : "erro desconhecido"
      setState({
        eta: null,
        isLoading: false,
        error:
          status === "REQUEST_DENIED"
            ? "Directions API não habilitada nesta chave — usando estimativa própria."
            : status === "ZERO_RESULTS"
              ? "Sem rota de carro até este cliente — usando estimativa própria."
              : `Previsão por trânsito indisponível (${status}) — usando estimativa própria.`,
      })
    })

    return () => {
      cancelled = true
    }
  }, [enabled, fromKey, toKey, tick])

  return state
}
