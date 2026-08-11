"use client"

import { useCallback, useSyncExternalStore } from "react"

export const SIDEBAR_MIN_WIDTH = 224
export const SIDEBAR_MAX_WIDTH = 560
export const SIDEBAR_DEFAULT_WIDTH = 256

const STORAGE_KEY = "geo-locate:sidebar-width:v1"

let currentWidth: number | null = null
const listeners = new Set<() => void>()

export function clampSidebarWidth(width: number): number {
  return Math.min(Math.max(Math.round(width), SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)
}

function readStoredWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH

  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) return clampSidebarWidth(stored)
  } catch {
    // localStorage indisponível: usa o padrão.
  }

  return SIDEBAR_DEFAULT_WIDTH
}

function getSnapshot(): number {
  if (currentWidth === null) currentWidth = readStoredWidth()
  return currentWidth
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Durante o arraste chamamos com `persist: false` — gravar no localStorage a cada
 * pixel é desperdício; salvamos uma vez ao soltar.
 */
export function setSidebarWidth(width: number, { persist = true }: { persist?: boolean } = {}) {
  currentWidth = clampSidebarWidth(width)

  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(currentWidth))
    } catch {
      // Largura só nesta sessão.
    }
  }

  listeners.forEach((listener) => listener())
}

export function useSidebarWidth(): [number, (width: number, options?: { persist?: boolean }) => void] {
  const width = useSyncExternalStore(subscribe, getSnapshot, () => SIDEBAR_DEFAULT_WIDTH)
  const setWidth = useCallback(
    (next: number, options?: { persist?: boolean }) => setSidebarWidth(next, options),
    [],
  )
  return [width, setWidth]
}
