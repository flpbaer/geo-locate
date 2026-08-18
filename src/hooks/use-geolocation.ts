"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { distanceInMeters } from "@/lib/geo"
import type { LatLng } from "@/types/area"

/** Peso do fix novo na média da velocidade — suaviza o ruído sem atrasar demais a reação. */
const SPEED_SMOOTHING = 0.4

/** Intervalo válido entre dois fixes para derivar velocidade deles. */
const MIN_SPEED_SAMPLE_MS = 1_000
const MAX_SPEED_SAMPLE_MS = 30_000

/**
 * Alta precisão liga o GPS do celular, mas no computador não há GPS: a posição vem da
 * rede, e o pedido preciso costuma expirar sem devolver nada. Por isso o modo preciso é
 * uma tentativa, não um requisito — expirando, cai para a localização de rede.
 */
const PRECISE_TIMEOUT_MS = 15_000
const PRECISE_MAX_AGE_MS = 10_000
const COARSE_TIMEOUT_MS = 30_000
const COARSE_MAX_AGE_MS = 60_000

/** No primeiro fix vale qualquer coisa em cache: aproximado agora é melhor que exato em 15 s. */
const FIRST_FIX_MAX_AGE_MS = 300_000

/**
 * De quanto em quanto tempo tentar voltar à alta precisão.
 *
 * Quem entra no modo dentro de um prédio cai para localização de rede; sem esta tentativa
 * periódica ficaria nela o dia inteiro, já com o GPS pegando sinal na rua.
 */
const PRECISE_RETRY_MS = 60_000

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
  /** Recomeça a aquisição depois de um erro, sem sair do modo GPS. */
  retry: () => void
}

function describeError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Permissão de localização negada. Libere o acesso no ícone de cadeado da barra de endereço."
  }
  if (error.code === error.TIMEOUT) {
    return "Nenhuma posição chegou a tempo. No computador a localização vem da rede — confira se o serviço de localização do sistema está ligado para este navegador."
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Não foi possível determinar a localização. Ligue o GPS (celular) ou o serviço de localização do sistema (computador)."
  }
  return "Falha ao ler a localização."
}

/**
 * Acompanha a posição do aparelho enquanto `enabled`.
 *
 * `watchPosition` (e não `getCurrentPosition` em laço) porque o navegador entrega cada
 * fix novo sem custo extra. A aquisição é em três frentes, para o painel nunca ficar
 * preso em "buscando sinal": um tiro inicial aceitando cache, o acompanhamento preciso, e
 * a queda para localização de rede se o preciso não responder. Erros transitórios com
 * posição já na tela são ignorados — em campo, um fix de 10 s atrás é melhor que nenhum.
 */
export function useGeolocation(enabled: boolean): GeolocationState {
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isWatching, setIsWatching] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const isSupported = typeof navigator !== "undefined" && "geolocation" in navigator

  /** Último fix e velocidade suavizada, para derivar velocidade em aparelhos sem `speed`. */
  const previous = useRef<{ fix: GeoFix; smoothedSpeed: number | null } | null>(null)

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

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

    let cancelled = false
    let watchId: number | null = null
    let hasFix = false
    let mode: "precise" | "coarse" = "precise"
    let upgradeTimer: ReturnType<typeof setInterval> | null = null

    const stopUpgradeTimer = () => {
      if (upgradeTimer !== null) clearInterval(upgradeTimer)
      upgradeTimer = null
    }

    setError(null)
    setIsWatching(true)

    const handleFix = (position: GeolocationPosition) => {
      if (cancelled) return

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
            next.speed = smoothed === null ? sample : smoothed + SPEED_SMOOTHING * (sample - smoothed)
          }
        }
      }

      previous.current = { fix: next, smoothedSpeed: next.speed }
      hasFix = true
      // Alta precisão respondendo: não há mais o que reconquistar.
      if (mode === "precise") stopUpgradeTimer()
      setFix(next)
      setError(null)
    }

    const handleError = (positionError: GeolocationPositionError) => {
      if (cancelled) return

      if (positionError.code === positionError.PERMISSION_DENIED) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId)
        watchId = null
        stopUpgradeTimer()
        setFix(null)
        setIsWatching(false)
        setError(describeError(positionError))
        return
      }

      // O pedido preciso expirou: cai para a rede e volta a tentar a precisão de vez em
      // quando, em vez de acusar erro por algo que o vendedor não tem como resolver.
      if (mode === "precise") {
        startWatch(false)
        if (upgradeTimer === null) {
          upgradeTimer = setInterval(() => {
            if (mode === "coarse") startWatch(true)
          }, PRECISE_RETRY_MS)
        }
        return
      }

      // Com posição na tela, uma leitura perdida não é assunto do usuário.
      if (hasFix) return

      setError(describeError(positionError))
    }

    function startWatch(precise: boolean) {
      if (cancelled) return
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)

      mode = precise ? "precise" : "coarse"

      watchId = navigator.geolocation.watchPosition(
        handleFix,
        handleError,
        precise
          ? { enableHighAccuracy: true, timeout: PRECISE_TIMEOUT_MS, maximumAge: PRECISE_MAX_AGE_MS }
          : { enableHighAccuracy: false, timeout: COARSE_TIMEOUT_MS, maximumAge: COARSE_MAX_AGE_MS },
      )
    }

    // Tiro inicial: uma posição em cache preenche o painel na hora, enquanto o
    // acompanhamento preciso ainda está negociando com o sistema.
    navigator.geolocation.getCurrentPosition(handleFix, () => {}, {
      enableHighAccuracy: false,
      timeout: COARSE_TIMEOUT_MS,
      maximumAge: FIRST_FIX_MAX_AGE_MS,
    })

    startWatch(true)

    return () => {
      cancelled = true
      stopUpgradeTimer()
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      setIsWatching(false)
    }
  }, [enabled, isSupported, attempt])

  return { fix, error, isWatching, isSupported, retry }
}
