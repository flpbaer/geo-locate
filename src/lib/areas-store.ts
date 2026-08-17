"use client"

import { useCallback, useSyncExternalStore } from "react"

import type { Area, AreaDraft, AreaPatch, AreaRouteSettings, AreaStyle, LatLng } from "@/types/area"

const STORAGE_KEY = "geo-locate:areas:v1"

/** Referência estável para o snapshot de servidor e para a lista vazia. */
const EMPTY: Area[] = []

let cached: Area[] | null = null
const listeners = new Set<() => void>()

function isLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)
}

/** Descarta entradas corrompidas: o localStorage é editável pelo usuário. */
function isArea(value: unknown): value is Area {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>

  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return false

  if (candidate.kind === "circle") {
    return isLatLng(candidate.center) && Number.isFinite(candidate.radius) && (candidate.radius as number) > 0
  }

  if (candidate.kind === "polygon") {
    return Array.isArray(candidate.path) && candidate.path.length >= 3 && candidate.path.every(isLatLng)
  }

  return false
}

function isHexColor(value: unknown): boolean {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

function isAreaStyle(value: unknown): value is AreaStyle {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>

  return (
    isHexColor(candidate.strokeColor) &&
    isHexColor(candidate.fillColor) &&
    typeof candidate.fillOpacity === "number" &&
    candidate.fillOpacity >= 0 &&
    candidate.fillOpacity <= 1 &&
    typeof candidate.strokeWeight === "number" &&
    candidate.strokeWeight > 0
  )
}

function isRouteSettings(value: unknown): value is AreaRouteSettings {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.enabled === "boolean" &&
    typeof candidate.roundTrip === "boolean" &&
    typeof candidate.useRoads === "boolean" &&
    (candidate.origin === null || isLatLng(candidate.origin))
  )
}

/**
 * Um campo opcional corrompido não invalida a área: ele é descartado e a área volta ao
 * padrão, em vez de o território desaparecer do mapa por causa de uma cor inválida.
 */
function normalizeArea(area: Area): Area {
  const normalized = { ...area }

  if (normalized.style && !isAreaStyle(normalized.style)) normalized.style = undefined
  if (normalized.route && !isRouteSettings(normalized.route)) normalized.route = undefined

  return normalized
}

function read(): Area[] {
  if (typeof window === "undefined") return EMPTY

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return EMPTY

    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return EMPTY

    const areas = parsed.filter(isArea).map(normalizeArea)
    return areas.length > 0 ? areas : EMPTY
  } catch {
    return EMPTY
  }
}

function persist(areas: Area[]) {
  cached = areas

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(areas))
  } catch {
    // Sem persistência nesta sessão — as áreas seguem só em memória.
  }

  listeners.forEach((listener) => listener())
}

function getSnapshot(): Area[] {
  if (cached === null) cached = read()
  return cached
}

function getServerSnapshot(): Area[] {
  return EMPTY
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function nextAreaName(areas: Area[]): string {
  return `Área ${areas.length + 1}`
}

/** Áreas salvas, compartilhadas entre o mapa e o painel de insights. */
export function useStoredAreas() {
  const areas = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const addArea = useCallback((draft: AreaDraft): Area => {
    const current = getSnapshot()
    const created = {
      ...draft,
      id: `area-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: draft.name?.trim() || nextAreaName(current),
      createdAt: Date.now(),
    } as Area

    persist([...current, created])
    return created
  }, [])

  const updateArea = useCallback((id: string, changes: AreaPatch) => {
    persist(getSnapshot().map((area) => (area.id === id ? ({ ...area, ...changes } as Area) : area)))
  }, [])

  const removeArea = useCallback((id: string) => {
    const next = getSnapshot().filter((area) => area.id !== id)
    persist(next.length > 0 ? next : EMPTY)
  }, [])

  const clearAreas = useCallback(() => {
    persist(EMPTY)
  }, [])

  return { areas, addArea, updateArea, removeArea, clearAreas }
}
