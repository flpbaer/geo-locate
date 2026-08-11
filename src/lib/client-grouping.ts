"use client"

import { useCallback, useSyncExternalStore } from "react"

import { getStateName, toStateCode } from "@/lib/br-states"
import type { Point } from "@/types/point"

export type GroupingMode = "none" | "state" | "city" | "category"

export const GROUPING_LABELS: Record<GroupingMode, string> = {
  none: "Sem pastas",
  state: "Por estado",
  city: "Por cidade",
  category: "Por categoria",
}

/** Agrupamentos que dependem de cidade/estado — exigem geocodificação. */
export const LOCATION_GROUPINGS: GroupingMode[] = ["state", "city"]

const STORAGE_KEY = "geo-locate:client-grouping:v1"

let currentMode: GroupingMode | null = null
const listeners = new Set<() => void>()

function readStoredMode(): GroupingMode {
  if (typeof window === "undefined") return "none"

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && stored in GROUPING_LABELS) return stored as GroupingMode
  } catch {
    // localStorage indisponível: seguimos com o padrão.
  }

  return "none"
}

function getSnapshot(): GroupingMode {
  if (currentMode === null) currentMode = readStoredMode()
  return currentMode
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setGroupingMode(mode: GroupingMode) {
  currentMode = mode

  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Preferência só em memória nesta sessão.
  }

  listeners.forEach((listener) => listener())
}

/** Preferência compartilhada entre a sidebar e o diálogo de importação. */
export function useGroupingMode(): [GroupingMode, (mode: GroupingMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "none" as GroupingMode)
  const setMode = useCallback((next: GroupingMode) => setGroupingMode(next), [])
  return [mode, setMode]
}

export interface ClientGroup {
  key: string
  label: string
  points: Point[]
  /** Grupo dos clientes sem o dado usado no agrupamento — vai sempre por último. */
  isFallback?: boolean
}

function fallbackLabel(mode: GroupingMode): string {
  return mode === "category" ? "Sem categoria" : "Sem localização"
}

/** Monta as pastas da sidebar, maiores primeiro e o grupo "sem dado" no fim. */
export function groupClients(points: Point[], mode: GroupingMode): ClientGroup[] {
  if (mode === "none") return [{ key: "all", label: "Todos os Clientes", points }]

  const groups = new Map<string, ClientGroup>()
  const orphans: Point[] = []

  points.forEach((point) => {
    let key: string | null = null
    let label = ""

    if (mode === "state") {
      const uf = toStateCode(point.state)
      if (uf) {
        key = uf
        label = `${getStateName(uf)} (${uf})`
      }
    } else if (mode === "city") {
      if (point.city) {
        const uf = toStateCode(point.state)
        key = `${point.city}|${uf ?? ""}`
        label = uf ? `${point.city} - ${uf}` : point.city
      }
    } else if (point.category) {
      key = point.category
      label = point.category
    }

    if (!key) {
      orphans.push(point)
      return
    }

    const existing = groups.get(key)
    if (existing) {
      existing.points.push(point)
    } else {
      groups.set(key, { key, label, points: [point] })
    }
  })

  const sorted = Array.from(groups.values()).sort(
    (a, b) => b.points.length - a.points.length || a.label.localeCompare(b.label, "pt-BR"),
  )

  if (orphans.length > 0) {
    sorted.push({ key: "__sem__", label: fallbackLabel(mode), points: orphans, isFallback: true })
  }

  return sorted
}
