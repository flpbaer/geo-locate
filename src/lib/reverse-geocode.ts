"use client"

import { toStateCode } from "@/lib/br-states"
import type { PointLocation } from "@/types/point"

export type ResolvedLocation = PointLocation

const CACHE_KEY = "geo-locate:reverse-geocode:v2"
/** 3 casas decimais ≈ 110m: precisão de sobra para cidade/estado e ótimo aproveitamento de cache. */
const CACHE_PRECISION = 3
const MAX_CONCURRENCY = 5
const MAX_RETRIES = 3

type CacheShape = Record<string, ResolvedLocation>

let memoryCache: CacheShape | null = null

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`
}

function readCache(): CacheShape {
  if (memoryCache) return memoryCache

  if (typeof window === "undefined") {
    memoryCache = {}
    return memoryCache
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    memoryCache = raw ? (JSON.parse(raw) as CacheShape) : {}
  } catch {
    memoryCache = {}
  }

  return memoryCache
}

function writeCache(cache: CacheShape) {
  memoryCache = cache
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
  }
}

export function clearReverseGeocodeCache() {
  memoryCache = {}
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}

function extractLocation(result: google.maps.GeocoderResult): ResolvedLocation {
  const components = result.address_components ?? []

  const find = (type: string) => components.find((component) => component.types.includes(type))

  // No Brasil o município costuma vir em administrative_area_level_2;
  // locality cobre os demais casos (e outros países).
  const cityComponent = find("administrative_area_level_2") ?? find("locality") ?? find("postal_town")
  const stateComponent = find("administrative_area_level_1")
  const neighborhoodComponent = find("sublocality_level_1") ?? find("sublocality") ?? find("neighborhood")
  const routeComponent = find("route")
  const numberComponent = find("street_number")

  const street = [routeComponent?.long_name, numberComponent?.long_name].filter(Boolean).join(", ")

  return {
    city: cityComponent?.long_name || undefined,
    state: toStateCode(stateComponent?.short_name) ?? stateComponent?.short_name ?? undefined,
    address: street || result.formatted_address || undefined,
    neighborhood: neighborhoodComponent?.long_name || undefined,
    postalCode: find("postal_code")?.long_name || undefined,
    placeId: result.place_id || undefined,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A biblioteca de geocoding pode ainda não estar disponível quando o SDK termina de
 * carregar, então caímos para o carregamento dinâmico antes de desistir.
 */
async function createGeocoder(): Promise<google.maps.Geocoder> {
  if (typeof window.google?.maps?.Geocoder === "function") {
    return new window.google.maps.Geocoder()
  }

  if (typeof window.google?.maps?.importLibrary === "function") {
    const library = (await window.google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary
    return new library.Geocoder()
  }

  throw new Error("A biblioteca de geocoding do Google Maps não está disponível")
}

async function geocodeOnce(
  geocoder: google.maps.Geocoder,
  lat: number,
  lng: number,
  attempt = 0,
): Promise<ResolvedLocation> {
  try {
    const response = await geocoder.geocode({ location: { lat, lng } })
    const result = response.results?.[0]
    return result ? extractLocation(result) : {}
  } catch (error) {
    const status = (error as { code?: string })?.code
    const isRateLimit = status === "OVER_QUERY_LIMIT" || String(error).includes("OVER_QUERY_LIMIT")

    if (isRateLimit && attempt < MAX_RETRIES) {
      await delay(2 ** attempt * 500)
      return geocodeOnce(geocoder, lat, lng, attempt + 1)
    }

    if (String(error).includes("ZERO_RESULTS")) {
      return {}
    }

    throw error
  }
}

export interface ReverseGeocodeItem {
  id: string
  lat: number
  lng: number
}

export interface ReverseGeocodeOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Resolve cidade/estado para uma lista de coordenadas usando a Geocoding API do Google.
 * Resultados são cacheados em localStorage por coordenada arredondada, então reimportar
 * a mesma base não gera novas chamadas (e nem novo custo).
 */
export async function reverseGeocodePoints(
  items: ReverseGeocodeItem[],
  { onProgress, signal }: ReverseGeocodeOptions = {},
): Promise<Map<string, ResolvedLocation>> {
  const resolved = new Map<string, ResolvedLocation>()
  if (items.length === 0) return resolved

  if (typeof window === "undefined" || !window.google?.maps) {
    throw new Error("A API do Google Maps ainda não foi carregada")
  }

  const cache = readCache()
  const geocoder = await createGeocoder()

  const pending: ReverseGeocodeItem[] = []
  for (const item of items) {
    const cached = cache[cacheKey(item.lat, item.lng)]
    if (cached) {
      resolved.set(item.id, cached)
    } else {
      pending.push(item)
    }
  }

  let done = resolved.size
  onProgress?.(done, items.length)

  if (pending.length === 0) return resolved

  let cursor = 0
  let cacheDirty = false
  let attempted = 0
  const failures: unknown[] = []

  const worker = async () => {
    while (cursor < pending.length) {
      if (signal?.aborted) return

      const item = pending[cursor++]
      attempted++
      try {
        const location = await geocodeOnce(geocoder, item.lat, item.lng)
        cache[cacheKey(item.lat, item.lng)] = location
        cacheDirty = true
        resolved.set(item.id, location)
      } catch (error) {
        failures.push(error)
        console.warn(`Falha ao geocodificar ${item.lat},${item.lng}`, error)
      } finally {
        done++
        onProgress?.(done, items.length)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, pending.length) }, worker))

  if (cacheDirty) writeCache(cache)

  // Falha total é problema de configuração (API/chave), não de um ponto específico:
  // propaga para a UI em vez de terminar em silêncio.
  if (attempted > 0 && failures.length === attempted) {
    throw failures[0] instanceof Error ? failures[0] : new Error(String(failures[0]))
  }

  return resolved
}
