"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { useAreas } from "@/components/areas/areas-provider"
import { useDrivingEta } from "@/components/gps/use-driving-eta"
import { useMapPoints } from "@/components/map-points-provider"
import { useGeolocation, type GeoFix } from "@/hooks/use-geolocation"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { distanceInMeters } from "@/lib/geo"
import {
  ARRIVAL_RADIUS_M,
  estimateTravelSeconds,
  nearestClients,
  SERVICE_SECONDS_PER_STOP,
  type NearbyClient,
} from "@/lib/gps"
import { solveRoute, type Route, type RouteStop } from "@/lib/route"
import type { LatLng } from "@/types/area"
import type { Point } from "@/types/point"

/** Quantos clientes pendentes entram na sequência recalculada. */
const ROUTE_HORIZON = 120

/**
 * Deslocamento que reancora a rota e a previsão.
 *
 * A ordenação é O(n²) e a previsão custa uma requisição da Directions — refazer as duas
 * a cada leitura do GPS (uma por segundo) queimaria CPU e cota sem mudar a resposta.
 * As distâncias mostradas na tela seguem vindo do fix ao vivo.
 */
const REANCHOR_DISTANCE_M = 120

/** Quantos clientes próximos listar. */
const NEARBY_LIMIT = 8

/** Distância mínima para corrigir a previsão pelo caminho já andado (evita divisão instável). */
const MIN_SCALABLE_DISTANCE_M = 200

/**
 * Precisão a partir da qual a chegada deixa de ser detectável.
 *
 * O raio de chegada acompanha a incerteza do fix, mas num fix de rede (±2 km) isso daria
 * "você chegou" com o cliente ainda a quilômetros. Sem GPS de verdade, quem confirma a
 * visita é o vendedor pelo botão.
 */
const MAX_ARRIVAL_ACCURACY_M = 250

export type VisitStatus = "done" | "skipped"

export type EtaSource = "traffic" | "directions" | "estimate"

export interface GpsEta {
  seconds: number
  source: EtaSource
  /** Distância por ruas quando vem da Directions; senão a linha reta corrigida. */
  meters: number
}

interface GpsContextType {
  isEnabled: boolean
  enable: () => void
  disable: () => void
  isSupported: boolean
  /** Última posição conhecida do aparelho. */
  fix: GeoFix | null
  error: string | null
  /** Recomeça a busca por posição depois de um erro, sem sair do modo. */
  retryLocation: () => void
  /** Base do modo: os clientes da área ativa, ou a base completa quando não há área. */
  scopeLabel: string
  scopeTotal: number
  /** Clientes mais próximos da posição atual, do mais perto ao mais longe. */
  nearby: NearbyClient[]
  /** Sequência recalculada a partir de onde o vendedor está agora. */
  route: Route | null
  /** `true` quando há mais pendentes do que a sequência considera. */
  horizonLimited: boolean
  nextStop: RouteStop | null
  /** Distância em linha reta até o próximo cliente, atualizada a cada fix. */
  nextStopDistance: number | null
  eta: GpsEta | null
  isEtaLoading: boolean
  etaError: string | null
  /** Traçado por ruas até o próximo cliente, quando a Directions respondeu. */
  roadPath: LatLng[] | null
  /** Clientes já resolvidos no dia, para marcá-los no mapa. */
  visitedPoints: { point: Point; status: VisitStatus }[]
  /** Previsão para atender todos os pendentes da sequência, incluindo o tempo em cada um. */
  remainingSeconds: number | null
  /** `true` quando a posição está dentro do raio de chegada do próximo cliente. */
  hasArrived: boolean
  visits: Record<string, VisitStatus>
  doneCount: number
  skippedCount: number
  pendingCount: number
  markVisited: (id: string) => void
  skipStop: (id: string) => void
  undoVisit: (id: string) => void
  resetVisits: () => void
  followMode: boolean
  setFollowMode: (follow: boolean) => void
  /** Previsão pela Directions com trânsito. Desligado, sobra a estimativa própria (grátis). */
  useTrafficEta: boolean
  setUseTrafficEta: (use: boolean) => void
}

const GpsContext = createContext<GpsContextType | undefined>(undefined)

/**
 * Modo de campo: acompanha a posição do aparelho, mantém a sequência de visitas a partir
 * dela e prevê a chegada no próximo cliente.
 *
 * A sequência é sempre recalculada de onde o vendedor está — é isso que diferencia o modo
 * GPS do painel de rota da área, onde a partida é um ponto fixo escolhido no mapa.
 */
export function GpsProvider({ children }: { children: React.ReactNode }) {
  const { points } = useMapPoints()
  const { activeArea, activePoints } = useAreas()

  const [isEnabled, setIsEnabled] = useState(false)
  const [visits, setVisits] = useState<Record<string, VisitStatus>>({})
  const [followMode, setFollowMode] = useState(true)
  const [useTrafficEta, setUseTrafficEta] = useState(true)
  const [anchor, setAnchor] = useState<LatLng | null>(null)

  const { fix, error, isSupported, retry: retryLocation } = useGeolocation(isEnabled)

  // Dirigindo, a tela não pode apagar com o painel aberto.
  useWakeLock(isEnabled)

  const scope: Point[] = activeArea ? activePoints : points
  const scopeLabel = activeArea ? activeArea.name : "Base completa"

  const pending = useMemo(() => scope.filter((point) => !visits[point.id]), [scope, visits])

  // Reancora quando o deslocamento passa do limite — ver REANCHOR_DISTANCE_M.
  useEffect(() => {
    if (!fix) {
      setAnchor(null)
      return
    }

    setAnchor((current) =>
      !current || distanceInMeters(current, fix.position) > REANCHOR_DISTANCE_M ? fix.position : current,
    )
  }, [fix])

  const visitedPoints = useMemo(
    () =>
      scope
        .filter((point) => visits[point.id])
        .map((point) => ({ point, status: visits[point.id] })),
    [scope, visits],
  )

  const nearby = useMemo(
    () => (fix ? nearestClients(pending, fix.position, NEARBY_LIMIT) : []),
    [pending, fix],
  )

  /**
   * Recortar pelos mais próximos da âncora mantém o cálculo interativo em bases grandes,
   * e não muda a resposta que importa: o próximo cliente nunca está no fim da lista.
   */
  const horizon = useMemo(() => {
    if (!anchor) return []
    if (pending.length <= ROUTE_HORIZON) return pending
    return nearestClients(pending, anchor, ROUTE_HORIZON).map((item) => item.point)
  }, [pending, anchor])

  const route = useMemo(
    () => (anchor ? solveRoute(horizon, { origin: anchor, roundTrip: false }) : null),
    [horizon, anchor],
  )

  const nextStop = route?.stops[0] ?? null

  const nextStopDistance = useMemo(() => {
    if (!fix || !nextStop) return null
    return distanceInMeters(fix.position, { lat: nextStop.point.lat, lng: nextStop.point.lng })
  }, [fix, nextStop])

  const {
    eta: drivingEta,
    isLoading: isEtaLoading,
    error: etaError,
  } = useDrivingEta(
    anchor,
    nextStop ? { lat: nextStop.point.lat, lng: nextStop.point.lng } : null,
    isEnabled && useTrafficEta,
  )

  /**
   * A previsão vem da Directions quando disponível, mas ela foi pedida da âncora — que
   * pode estar até REANCHOR_DISTANCE_M atrás. Encurtar na proporção do caminho já andado
   * faz o número cair enquanto se dirige, em vez de congelar até a próxima consulta.
   */
  const eta = useMemo<GpsEta | null>(() => {
    if (!nextStop || nextStopDistance === null) return null

    if (drivingEta && anchor) {
      const anchorDistance = distanceInMeters(anchor, {
        lat: nextStop.point.lat,
        lng: nextStop.point.lng,
      })
      const ratio =
        anchorDistance > MIN_SCALABLE_DISTANCE_M
          ? Math.min(nextStopDistance / anchorDistance, 1)
          : 1

      return {
        seconds: drivingEta.seconds * ratio,
        meters: drivingEta.meters * ratio,
        source: drivingEta.inTraffic ? "traffic" : "directions",
      }
    }

    return {
      seconds: estimateTravelSeconds(nextStopDistance, fix?.speed ?? null),
      meters: nextStopDistance,
      source: "estimate",
    }
  }, [nextStop, nextStopDistance, drivingEta, anchor, fix?.speed])

  /** Trajeto + atendimento de todos os pendentes da sequência. */
  const remainingSeconds = useMemo(() => {
    if (!route || !eta) return null

    const travelAfterFirst = route.stops
      .slice(1)
      .reduce((total, stop) => total + estimateTravelSeconds(stop.legDistance), 0)

    return eta.seconds + travelAfterFirst + route.stops.length * SERVICE_SECONDS_PER_STOP
  }, [route, eta])

  // O raio de chegada nunca é menor que a incerteza do fix: num fix de ±300 m,
  // "estou a 90 m" não prova nada. Acima de MAX_ARRIVAL_ACCURACY_M não há detecção.
  const hasArrived =
    nextStopDistance !== null &&
    fix !== null &&
    fix.accuracy <= MAX_ARRIVAL_ACCURACY_M &&
    nextStopDistance <= Math.max(ARRIVAL_RADIUS_M, fix.accuracy)

  const setVisit = useCallback((id: string, status: VisitStatus) => {
    setVisits((current) => ({ ...current, [id]: status }))
  }, [])

  const markVisited = useCallback((id: string) => setVisit(id, "done"), [setVisit])
  const skipStop = useCallback((id: string) => setVisit(id, "skipped"), [setVisit])

  const undoVisit = useCallback((id: string) => {
    setVisits((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  const resetVisits = useCallback(() => setVisits({}), [])

  const statuses = Object.values(visits)

  const value: GpsContextType = {
    isEnabled,
    enable: () => setIsEnabled(true),
    disable: () => setIsEnabled(false),
    isSupported,
    fix,
    error,
    retryLocation,
    scopeLabel,
    scopeTotal: scope.length,
    nearby,
    route,
    horizonLimited: pending.length > horizon.length,
    nextStop,
    nextStopDistance,
    eta,
    isEtaLoading,
    etaError,
    roadPath: drivingEta?.path ?? null,
    visitedPoints,
    remainingSeconds,
    hasArrived,
    visits,
    doneCount: statuses.filter((status) => status === "done").length,
    skippedCount: statuses.filter((status) => status === "skipped").length,
    pendingCount: pending.length,
    markVisited,
    skipStop,
    undoVisit,
    resetVisits,
    followMode,
    setFollowMode,
    useTrafficEta,
    setUseTrafficEta,
  }

  return <GpsContext.Provider value={value}>{children}</GpsContext.Provider>
}

export function useGps() {
  const context = useContext(GpsContext)
  if (context === undefined) {
    throw new Error("useGps must be used within a GpsProvider")
  }
  return context
}
