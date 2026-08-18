"use client"

import { useEffect, useRef, useState } from "react"

import { distanceInMeters } from "@/lib/geo"
import type { LatLng } from "@/types/area"

/** Peso do fix novo na média da velocidade — suaviza o ruído sem atrasar demais a reação. */
const SPEED_SMOOTHING = 0.4

/** Intervalo válido entre dois fixes para derivar velocidade deles. */
const MIN_SPEED_SAMPLE_MS = 1_000
const MAX_SPEED_SAMPLE_MS = 30_000

export interface GeoFix {
  position: LatLng
  /** Raio de incerteza em metros — define o que conta como "cheguei". */
  accuracy: number
  /** Rumo em graus, quando o aparelho informa (celular em movimento). */
  heading: number | null
  /** Velocidade em m/s: a do aparelho, ou derivada entre dois fixes. */
  speed: number | null
  timestamp: number
}

export interface GeolocationState {
  fix: GeoFix | null
  error: string | null
  isWatching: boolean
  isSupported: boolean
}

function describeError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Permissão de localização negada. Libere o acesso no ícone de cadeado da barra de endereço."
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Não foi possível obter a localização. Verifique se o GPS está ligado."
  }
  if (error.code === error.TIMEOUT) {
    return "O GPS demorou para responder — tentando de novo."
  }
  return "Falha ao ler a localização."
}

/**
 * Acompanha a posição do aparelho enquanto `enabled`.
 *
 * `watchPosition` (e não `getCurrentPosition` em laço) porque o navegador entrega cada
 * fix novo do GPS sem custo extra. Erros transitórios (timeout) preservam o último fix:
 * em campo, uma posição de 10 s atrás é melhor que nenhuma.
 */
export function useGeolocation(enabled: boolean): GeolocationState {
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isWatching, setIsWatching] = useState(false)

  const isSupported = typeof navigator !== "undefined" && "geolocation" in navigator

  /** Último fix e velocidade suavizada, para derivar velocidade em aparelhos sem `speed`. */
  const previous = useRef<{ fix: GeoFix; smoothedSpeed: number | null } | null>(null)

  useEffect(() => {
    if (!enabled) {
      setFix(null)
      setError(null)
      setIsWatching(false)
      previous.current = null
      return
    }

    if (!isSupported) {
      setError("Este navegador não expõe a localização do aparelho.")
      return
    }

    // Sem HTTPS o navegador recusa a API: melhor dizer isso antes de pedir permissão.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("A localização exige HTTPS (ou localhost). Abra o app por uma conexão segura.")
      return
    }

    setIsWatching(true)

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading, speed } = position.coords
        const next: GeoFix = {
          position: { lat: latitude, lng: longitude },
          accuracy,
          heading: Number.isFinite(heading) ? heading : null,
          speed: typeof speed === "number" && Number.isFinite(speed) && speed >= 0 ? speed : null,
          timestamp: position.timestamp,
        }

        // Desktop e alguns Androids devolvem `speed: null`; a distância entre dois fixes
        // dá uma velocidade utilizável para o ETA.
        if (next.speed === null && previous.current) {
          const elapsed = next.timestamp - previous.current.fix.timestamp
          if (elapsed >= MIN_SPEED_SAMPLE_MS && elapsed <= MAX_SPEED_SAMPLE_MS) {
            const moved = distanceInMeters(previous.current.fix.position, next.position)
            // Movimento menor que a precisão é ruído do próprio GPS, não deslocamento.
            if (moved > accuracy) {
              const sample = moved / (elapsed / 1000)
              const smoothed = previous.current.smoothedSpeed
              next.speed =
                smoothed === null ? sample : smoothed + SPEED_SMOOTHING * (sample - smoothed)
            }
          }
        }

        previous.current = { fix: next, smoothedSpeed: next.speed }
        setFix(next)
        setError(null)
      },
      (positionError) => {
        setError(describeError(positionError))
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setFix(null)
          setIsWatching(false)
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      setIsWatching(false)
    }
  }, [enabled, isSupported])

  return { fix, error, isWatching, isSupported }
}
