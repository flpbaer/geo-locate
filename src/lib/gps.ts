import { distanceInMeters } from "@/lib/geo"
import type { LatLng } from "@/types/area"
import type { Point } from "@/types/point"

/**
 * Quanto o caminho por ruas é mais longo que a linha reta.
 *
 * Usado só na estimativa offline (sem Directions). 1.35 é o meio de campo entre malha
 * urbana em grade (~1.2) e trajetos com rio/rodovia no meio (~1.6): erra por pouco nas
 * duas pontas, em vez de errar muito numa delas.
 */
export const DETOUR_FACTOR = 1.35

/** Velocidade presumida quando o aparelho não informa uma confiável (trânsito urbano). */
export const DEFAULT_SPEED_KMH = 30
export const DEFAULT_SPEED_MPS = DEFAULT_SPEED_KMH / 3.6

/** Abaixo disso é semáforo/parada — usar essa velocidade daria ETA de horas. */
const MIN_TRUSTED_SPEED_MPS = 2.8

/** Acima disso é ruído de GPS (~120 km/h). */
const MAX_TRUSTED_SPEED_MPS = 33

/**
 * Distância que caracteriza "cheguei no cliente". Comparada sempre com a precisão do
 * fix: num fix de ±200 m, 90 m não significa nada.
 */
export const ARRIVAL_RADIUS_M = 90

/** Tempo presumido dentro de cada cliente, somado à previsão do dia. */
export const SERVICE_SECONDS_PER_STOP = 15 * 60

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

export interface NearbyClient {
  point: Point
  /** Distância em linha reta desde a posição atual, em metros. */
  distance: number
  /** Azimute de 0 a 360 graus, para dizer em que direção o cliente está. */
  bearing: number
}

/** Azimute inicial de `from` para `to`, em graus (0 = norte, sentido horário). */
export function bearingBetween(from: LatLng, to: LatLng): number {
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLng = toRadians(to.lng - from.lng)

  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)

  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

const COMPASS_POINTS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"]

/** Rosa dos ventos em português — "L" de leste, não "E" de east. */
export function compassLabel(bearing: number): string {
  return COMPASS_POINTS[Math.round(((bearing % 360) + 360) % 360 / 45) % 8]
}

/**
 * Tempo de viagem sem consultar a Directions: linha reta corrigida pelo desvio de ruas,
 * dividida pela velocidade atual quando ela é confiável.
 *
 * É o piso de qualidade do ETA — vale enquanto a resposta da Directions não chega, e
 * quando ela não está disponível.
 */
export function estimateTravelSeconds(straightMeters: number, speedMps?: number | null): number {
  const trusted =
    typeof speedMps === "number" &&
    Number.isFinite(speedMps) &&
    speedMps >= MIN_TRUSTED_SPEED_MPS &&
    speedMps <= MAX_TRUSTED_SPEED_MPS

  const speed = trusted ? (speedMps as number) : DEFAULT_SPEED_MPS

  return (straightMeters * DETOUR_FACTOR) / speed
}

/** Clientes mais próximos da posição, do mais perto ao mais longe. */
export function nearestClients(points: Point[], from: LatLng, limit: number): NearbyClient[] {
  return points
    .map((point) => {
      const target = { lat: point.lat, lng: point.lng }
      return { point, distance: distanceInMeters(from, target), bearing: bearingBetween(from, target) }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—"

  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return "menos de 1 min"
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")} min`
}

/** Hora de chegada no formato 24h. */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

export function formatSpeed(speedMps: number | null): string {
  if (speedMps === null || !Number.isFinite(speedMps) || speedMps < MIN_TRUSTED_SPEED_MPS) return "parado"
  return `${Math.round(speedMps * 3.6)} km/h`
}

export function formatAccuracy(meters: number): string {
  return `±${Math.round(meters).toLocaleString("pt-BR")} m`
}
