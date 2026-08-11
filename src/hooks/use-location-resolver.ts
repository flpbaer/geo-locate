"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useMapPoints } from "@/components/map-points-provider"
import { clearReverseGeocodeCache, reverseGeocodePoints } from "@/lib/reverse-geocode"
import type { Point, UpdatePointData } from "@/types/point"

interface ResolverState {
  isResolving: boolean
  done: number
  total: number
  error: string | null
}

const INITIAL_STATE: ResolverState = { isResolving: false, done: 0, total: 0, error: null }

/**
 * Garante que todo cliente tenha cidade/estado: quem veio com esses dados no CSV é
 * aproveitado como está, e o restante é resolvido por geocodificação reversa.
 */
export function useLocationResolver({ auto = true }: { auto?: boolean } = {}) {
  const { points, updateManyPoints } = useMapPoints()
  const [state, setState] = useState<ResolverState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  /** Ids já tentados, para não reprocessar em loop quem a geocodificação não conseguiu resolver. */
  const attemptedRef = useRef<Set<string>>(new Set())

  const pendingPoints = useMemo(() => points.filter((point) => !point.city || !point.state), [points])
  const untriedCount = useMemo(
    () => pendingPoints.filter((point) => !attemptedRef.current.has(point.id)).length,
    [pendingPoints],
  )

  const runResolution = useCallback(
    async (targets: Point[]) => {
      if (targets.length === 0 || runningRef.current) return

      runningRef.current = true
      targets.forEach((point) => attemptedRef.current.add(point.id))

      const controller = new AbortController()
      abortRef.current = controller

      setState({ isResolving: true, done: 0, total: targets.length, error: null })

      try {
        const resolved = await reverseGeocodePoints(
          targets.map(({ id, lat, lng }) => ({ id, lat, lng })),
          {
            signal: controller.signal,
            onProgress: (done, total) => setState((prev) => ({ ...prev, done, total })),
          },
        )

        const updates: { id: string; data: UpdatePointData }[] = []
        targets.forEach((point) => {
          const location = resolved.get(point.id)
          if (!location) return

          const data: UpdatePointData = {}
          // O que veio do CSV tem prioridade sobre o que a geocodificação devolveu.
          if (!point.city && location.city) data.city = location.city
          if (!point.state && location.state) data.state = location.state

          if (Object.keys(data).length > 0) updates.push({ id: point.id, data })
        })

        if (updates.length > 0 && !controller.signal.aborted) {
          await updateManyPoints(updates)
        }

        setState((prev) => ({ ...prev, isResolving: false }))
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isResolving: false,
          error: error instanceof Error ? error.message : "Falha ao resolver localizações",
        }))
      } finally {
        runningRef.current = false
        abortRef.current = null
      }
    },
    [updateManyPoints],
  )

  const resolve = useCallback(() => runResolution(pendingPoints), [pendingPoints, runResolution])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState((prev) => ({ ...prev, isResolving: false }))
  }, [])

  /** Descarta o cache e refaz a identificação de toda a base. */
  const reprocess = useCallback(async () => {
    clearReverseGeocodeCache()
    attemptedRef.current.clear()
    await runResolution(points)
  }, [points, runResolution])

  useEffect(() => {
    if (!auto || untriedCount === 0) return
    resolve()
    // Dispara apenas quando surgem clientes ainda não tentados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, untriedCount])

  return {
    ...state,
    pendingCount: pendingPoints.length,
    resolve,
    reprocess,
    cancel,
  }
}
