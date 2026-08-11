"use client"

import { normalizeText } from "@/lib/br-states"

export interface PlaceDetails {
  placeId?: string
  displayName?: string
  formattedAddress?: string
  rating?: number
  ratingCount?: number
  photoUrl?: string
  phone?: string
  website?: string
  googleMapsUri?: string
  /** "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" */
  businessStatus?: string
  /** Derivado na leitura, nunca lido do cache — senão envelhece. */
  openNow?: boolean
  weekdayHours?: string[]
  openingHours?: OpeningHours
  utcOffsetMinutes?: number
  types?: string[]
  /** Marca que a busca rodou e não encontrou nada — evita repetir a chamada. */
  notFound?: boolean
}

const CACHE_KEY = "geo-locate:places:v1"
/** Raio da busca por nome ao redor da coordenada do cliente. */
const SEARCH_RADIUS_METERS = 300

type CacheShape = Record<string, PlaceDetails>

let memoryCache: CacheShape | null = null

function cacheKey(name: string, lat: number, lng: number): string {
  return `${normalizeText(name)}@${lat.toFixed(4)},${lng.toFixed(4)}`
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

function writeCache(key: string, value: PlaceDetails) {
  const cache = readCache()
  cache[key] = value
  memoryCache = cache

  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Cota estourada: seguimos só com o cache em memória.
  }
}

export function clearPlacesCache() {
  memoryCache = {}
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}

const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "photos",
  "nationalPhoneNumber",
  "websiteURI",
  "googleMapsURI",
  "businessStatus",
  "regularOpeningHours",
  // isOpen() precisa do fuso além do horário para dizer se está aberto agora.
  "utcOffsetMinutes",
  "types",
]

interface PlacesLibrary {
  Place: {
    searchByText(request: Record<string, unknown>): Promise<{ places: PlaceResult[] }>
  }
}

interface OpeningPoint {
  day: number
  hour: number
  minute: number
}

interface OpeningHours {
  weekdayDescriptions?: string[]
  periods?: { open?: OpeningPoint; close?: OpeningPoint }[]
}

interface PlaceResult {
  id?: string
  displayName?: string
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  photos?: { getURI(options?: { maxHeight?: number; maxWidth?: number }): string }[]
  nationalPhoneNumber?: string
  websiteURI?: string
  googleMapsURI?: string
  businessStatus?: string
  types?: string[]
  utcOffsetMinutes?: number
  regularOpeningHours?: OpeningHours
}

const MINUTES_IN_WEEK = 7 * 24 * 60

function toMinutesOfWeek({ day, hour, minute }: OpeningPoint): number {
  return day * 24 * 60 + hour * 60 + minute
}

/**
 * `Place.isOpen()` só existe no canal beta da API, então calculamos a partir dos
 * períodos, deslocando o relógio para o fuso do próprio local.
 */
function computeOpenNow(hours?: OpeningHours, utcOffsetMinutes?: number): boolean | undefined {
  if (!hours?.periods?.length || utcOffsetMinutes === undefined) return undefined

  const atPlace = new Date(Date.now() + utcOffsetMinutes * 60_000)
  const nowMinutes = atPlace.getUTCDay() * 24 * 60 + atPlace.getUTCHours() * 60 + atPlace.getUTCMinutes()

  return hours.periods.some((period) => {
    if (!period.open) return false
    // Período sem fechamento significa aberto 24 horas.
    if (!period.close) return true

    const start = toMinutesOfWeek(period.open)
    let end = toMinutesOfWeek(period.close)
    if (end <= start) end += MINUTES_IN_WEEK

    return (
      (nowMinutes >= start && nowMinutes < end) ||
      (nowMinutes + MINUTES_IN_WEEK >= start && nowMinutes + MINUTES_IN_WEEK < end)
    )
  })
}

function withOpenNow(details: PlaceDetails): PlaceDetails {
  return { ...details, openNow: computeOpenNow(details.openingHours, details.utcOffsetMinutes) }
}

/**
 * Procura o estabelecimento no Google pelo nome do cliente, ancorado nas coordenadas
 * dele. Devolve `null` quando a Places API não está habilitada para a chave — o painel
 * simplesmente deixa de mostrar essa seção.
 *
 * Cada chamada é cobrada pelo Google, por isso o resultado (inclusive "não encontrado")
 * fica em cache no localStorage.
 */
export async function fetchPlaceDetails(point: {
  name: string
  lat: number
  lng: number
}): Promise<PlaceDetails | null> {
  if (typeof window === "undefined" || !window.google?.maps?.importLibrary) return null

  const key = cacheKey(point.name, point.lat, point.lng)
  const cached = readCache()[key]
  if (cached) return withOpenNow(cached)

  const { Place } = (await window.google.maps.importLibrary("places")) as unknown as PlacesLibrary

  const { places } = await Place.searchByText({
    textQuery: point.name,
    fields: FIELDS,
    maxResultCount: 1,
    locationBias: {
      center: { lat: point.lat, lng: point.lng },
      radius: SEARCH_RADIUS_METERS,
    },
    language: "pt-BR",
    region: "br",
  })

  const place = places?.[0]

  if (!place) {
    const notFound: PlaceDetails = { notFound: true }
    writeCache(key, notFound)
    return notFound
  }

  const details: PlaceDetails = {
    placeId: place.id,
    displayName: place.displayName,
    formattedAddress: place.formattedAddress,
    rating: place.rating,
    ratingCount: place.userRatingCount,
    photoUrl: place.photos?.[0]?.getURI({ maxHeight: 400 }),
    phone: place.nationalPhoneNumber,
    website: place.websiteURI,
    googleMapsUri: place.googleMapsURI,
    businessStatus: place.businessStatus,
    weekdayHours: place.regularOpeningHours?.weekdayDescriptions,
    openingHours: place.regularOpeningHours,
    utcOffsetMinutes: place.utcOffsetMinutes,
    types: place.types,
  }

  writeCache(key, details)
  return withOpenNow(details)
}
