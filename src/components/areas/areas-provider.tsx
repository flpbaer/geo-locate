"use client"

import type React from "react"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

import { useMapPoints } from "@/components/map-points-provider"
import { useStoredAreas } from "@/lib/areas-store"
import * as drawing from "@/lib/drawing-draft"
import type { Area, AreaDraft, AreaKind, AreaPatch, DrawingDraft, LatLng } from "@/types/area"
import type { Point } from "@/types/point"
import { areasUseCase, type AreaInsights } from "@/usecases/areas-usecase"

interface AreasContextType {
  areas: Area[]
  activeArea: Area | null
  /** Quantos clientes caem em cada área, por id. */
  areaCounts: Record<string, number>
  /** Clientes dentro da área ativa — é a entrada do criador de rota. */
  activePoints: Point[]
  activeInsights: AreaInsights | null
  /** Forma sendo desenhada no momento, ou null quando o desenho está inativo. */
  drawingKind: AreaKind | null
  /** Pontos já marcados no desenho em andamento. */
  draft: DrawingDraft | null
  startDrawing: (kind: AreaKind) => void
  cancelDrawing: () => void
  /** Registra um clique do mapa no desenho; o último ponto conclui a área. */
  addDraftPoint: (point: LatLng) => void
  /** Desfaz o último ponto marcado (Ctrl+Z). */
  undoDraftPoint: () => void
  /** Fecha um polígono com 3 ou mais vértices. */
  finishDraft: () => void
  canUndoDraft: boolean
  canFinishDraft: boolean
  createArea: (draft: AreaDraft) => Area
  selectArea: (id: string | null) => void
  renameArea: (id: string, name: string) => void
  /** Commit de arraste/redimensionamento da forma no mapa. */
  updateGeometry: (id: string, geometry: Omit<AreaPatch, "name">) => void
  removeArea: (id: string) => void
}

const AreasContext = createContext<AreasContextType | undefined>(undefined)

export function AreasProvider({ children }: { children: React.ReactNode }) {
  const { points } = useMapPoints()
  const { areas, addArea, updateArea, removeArea: removeStoredArea } = useStoredAreas()

  const [activeAreaId, setActiveAreaId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DrawingDraft | null>(null)

  const activeArea = useMemo(
    () => areas.find((area) => area.id === activeAreaId) ?? null,
    [areas, activeAreaId],
  )

  const areaCounts = useMemo(() => areasUseCase.countByArea(points, areas), [points, areas])

  const activePoints = useMemo(
    () => (activeArea ? areasUseCase.pointsInArea(points, activeArea) : []),
    [points, activeArea],
  )

  const activeInsights = useMemo(
    () => (activeArea ? areasUseCase.buildAreaInsights(activePoints, activeArea, points.length) : null),
    [activePoints, activeArea, points.length],
  )

  const createArea = useCallback(
    (area: AreaDraft) => {
      const created = addArea(area)
      setActiveAreaId(created.id)
      setDraft(null)
      return created
    },
    [addArea],
  )

  const startDrawing = useCallback((kind: AreaKind) => setDraft(drawing.startDraft(kind)), [])

  const cancelDrawing = useCallback(() => setDraft(null), [])

  const addDraftPoint = useCallback(
    (point: LatLng) => {
      if (!draft) return

      const { draft: next, completed } = drawing.addDraftPoint(draft, point)

      if (completed) createArea(completed)
      else setDraft(next)
    },
    [draft, createArea],
  )

  const undoDraftPoint = useCallback(() => {
    setDraft((current) => (current ? drawing.undoDraftPoint(current) : current))
  }, [])

  const finishDraft = useCallback(() => {
    const completed = drawing.finishDraft(draft)
    if (completed) createArea(completed)
  }, [draft, createArea])

  const removeArea = useCallback(
    (id: string) => {
      removeStoredArea(id)
      setActiveAreaId((current) => (current === id ? null : current))
    },
    [removeStoredArea],
  )

  const renameArea = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (trimmed) updateArea(id, { name: trimmed })
    },
    [updateArea],
  )

  const updateGeometry = useCallback(
    (id: string, geometry: Omit<AreaPatch, "name">) => {
      updateArea(id, geometry)
    },
    [updateArea],
  )

  const value: AreasContextType = {
    areas,
    activeArea,
    areaCounts,
    activePoints,
    activeInsights,
    drawingKind: draft?.kind ?? null,
    draft,
    startDrawing,
    cancelDrawing,
    addDraftPoint,
    undoDraftPoint,
    finishDraft,
    canUndoDraft: drawing.canUndoDraft(draft),
    canFinishDraft: drawing.canFinishDraft(draft),
    createArea,
    selectArea: setActiveAreaId,
    renameArea,
    updateGeometry,
    removeArea,
  }

  return <AreasContext.Provider value={value}>{children}</AreasContext.Provider>
}

export function useAreas() {
  const context = useContext(AreasContext)
  if (context === undefined) {
    throw new Error("useAreas must be used within an AreasProvider")
  }
  return context
}
