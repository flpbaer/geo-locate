"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { useMapPoints } from "@/components/map-points-provider"
import { nextStyle, resolveAreaStyle } from "@/lib/area-style"
import { useStoredAreas } from "@/lib/areas-store"
import * as drawing from "@/lib/drawing-draft"
import { distanceInMeters } from "@/lib/geo"
import { solveRoute, type Route } from "@/lib/route"
import type {
  Area,
  AreaDraft,
  AreaGeometry,
  AreaKind,
  AreaPatch,
  AreaRouteSettings,
  AreaStyle,
  DrawingDraft,
  LatLng,
} from "@/types/area"
import type { Point } from "@/types/point"
import { areasUseCase, type AreaInsights } from "@/usecases/areas-usecase"

const DEFAULT_ROUTE_SETTINGS: AreaRouteSettings = {
  enabled: false,
  origin: null,
  roundTrip: false,
  useRoads: false,
}

/** Áreas salvas antes da rota existir não têm o campo — caem no padrão. */
export function resolveRouteSettings(area: Pick<Area, "route"> | null | undefined): AreaRouteSettings {
  return area?.route ?? DEFAULT_ROUTE_SETTINGS
}

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
  /** Onde o cursor está no mapa durante o desenho — é o que fecha a forma provisória. */
  draftCursor: LatLng | null
  setDraftCursor: (cursor: LatLng | null) => void
  /**
   * A forma que o desenho já tem: o círculo até o cursor, ou o polígono fechado nele.
   * Null enquanto não há forma nenhuma (círculo sem centro, polígono com 1 ou 2 vértices).
   */
  draftGeometry: AreaGeometry | null
  /** Clientes que o desenho já pegaria se fosse concluído agora. */
  draftPoints: Point[]
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
  /** Aparência que a próxima área vai receber — usada no preview do desenho. */
  draftStyle: AreaStyle
  /**
   * Painel de áreas à vista ou minimizado. Começa minimizado: a lista não precisa ocupar
   * o mapa até alguém querer olhar. Desenhar, criar ou selecionar área traz ele de volta.
   */
  isAreasPanelOpen: boolean
  openAreasPanel: () => void
  closeAreasPanel: () => void
  toggleAreasPanel: () => void
  createArea: (draft: AreaDraft) => Area
  selectArea: (id: string | null) => void
  renameArea: (id: string, name: string) => void
  /** Troca a cor de borda, de fundo e a opacidade de uma área. */
  updateStyle: (id: string, style: AreaStyle) => void
  /** Configuração de rota da área ativa. */
  routeSettings: AreaRouteSettings
  /** Sequência calculada para a área ativa, ou null quando a rota está desligada. */
  activeRoute: Route | null
  updateRouteSettings: (changes: Partial<AreaRouteSettings>) => void
  /** Modo em que o próximo clique no mapa define a origem da rota. */
  isPickingOrigin: boolean
  startPickingOrigin: () => void
  cancelPickingOrigin: () => void
  setRouteOrigin: (origin: LatLng | null) => void
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
  const [draftCursor, setDraftCursor] = useState<LatLng | null>(null)
  const [isAreasPanelOpen, setIsAreasPanelOpen] = useState(false)

  const activeArea = useMemo(
    () => areas.find((area) => area.id === activeAreaId) ?? null,
    [areas, activeAreaId],
  )

  // Limpar a base no meio de um desenho deixaria um rascunho que ninguém pode concluir:
  // sem cliente, criar área está fora do ar.
  useEffect(() => {
    if (points.length === 0) {
      setDraft(null)
      setDraftCursor(null)
    }
  }, [points.length])

  const areaCounts = useMemo(() => areasUseCase.countByArea(points, areas), [points, areas])

  const activePoints = useMemo(
    () => (activeArea ? areasUseCase.pointsInArea(points, activeArea) : []),
    [points, activeArea],
  )

  const activeInsights = useMemo(
    () => (activeArea ? areasUseCase.buildAreaInsights(activePoints, activeArea, points.length) : null),
    [activePoints, activeArea, points.length],
  )

  /**
   * A forma provisória: o que a área seria se o desenho fosse concluído neste instante.
   * O cursor entra nela — é o que faz o raio crescer e o polígono fechar antes do clique.
   */
  const draftGeometry = useMemo<AreaGeometry | null>(() => {
    if (!draft) return null

    if (draft.kind === "circle") {
      if (!draft.center || !draftCursor) return null

      const radius = distanceInMeters(draft.center, draftCursor)
      return radius > 0 ? { kind: "circle", center: draft.center, radius } : null
    }

    const path = draftCursor ? [...draft.vertices, draftCursor] : draft.vertices
    return path.length >= drawing.MIN_POLYGON_VERTICES ? { kind: "polygon", path } : null
  }, [draft, draftCursor])

  /**
   * Quem a área em desenho já pegaria. Sai no mapa em destaque e na contagem da toolbar:
   * escolher o raio no escuro e só depois ver o número era o passo que faltava.
   */
  const draftPoints = useMemo(
    () => (draftGeometry ? areasUseCase.pointsInArea(points, draftGeometry) : []),
    [points, draftGeometry],
  )

  // Novas áreas já nascem com cor própria, para se distinguirem das existentes.
  const draftStyle = useMemo(
    () => nextStyle(areas.map((area) => resolveAreaStyle(area).strokeColor)),
    [areas],
  )

  const createArea = useCallback(
    (area: AreaDraft) => {
      const created = addArea({ style: draftStyle, ...area })
      setActiveAreaId(created.id)
      setDraft(null)
      setDraftCursor(null)
      setIsAreasPanelOpen(true)
      return created
    },
    [addArea, draftStyle],
  )

  // Desenhar precisa do painel: é lá que fica o passo a passo e o desfazer.
  const startDrawing = useCallback((kind: AreaKind) => {
    setDraft(drawing.startDraft(kind))
    // Zera o cursor do desenho anterior: senão a forma nova nasceria com a última
    // posição conhecida e o preview piscaria errado até o primeiro movimento.
    setDraftCursor(null)
    setIsAreasPanelOpen(true)
  }, [])

  const cancelDrawing = useCallback(() => {
    setDraft(null)
    setDraftCursor(null)
  }, [])

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

  const updateStyle = useCallback(
    (id: string, style: AreaStyle) => {
      updateArea(id, { style })
    },
    [updateArea],
  )

  /**
   * Identidade estável: o efeito que minimiza o painel ao entrar no modo GPS depende
   * destas funções, e uma nova a cada render o faria disparar a cada leitura do GPS —
   * reabrir o painel viraria impossível.
   */
  const openAreasPanel = useCallback(() => setIsAreasPanelOpen(true), [])
  const closeAreasPanel = useCallback(() => setIsAreasPanelOpen(false), [])
  const toggleAreasPanel = useCallback(() => setIsAreasPanelOpen((current) => !current), [])

  const [isPickingOrigin, setIsPickingOrigin] = useState(false)

  // Trocar de área encerra a escolha de origem em andamento, que era da área anterior.
  // Selecionar (inclusive clicando na forma no mapa) é pedido de ver os números dela.
  const selectArea = useCallback((id: string | null) => {
    setActiveAreaId(id)
    setIsPickingOrigin(false)
    if (id) setIsAreasPanelOpen(true)
  }, [])

  const routeSettings = useMemo(() => resolveRouteSettings(activeArea), [activeArea])

  const updateRouteSettings = useCallback(
    (changes: Partial<AreaRouteSettings>) => {
      if (!activeArea) return
      updateArea(activeArea.id, { route: { ...resolveRouteSettings(activeArea), ...changes } })
    },
    [activeArea, updateArea],
  )

  const setRouteOrigin = useCallback(
    (origin: LatLng | null) => {
      updateRouteSettings({ origin })
      setIsPickingOrigin(false)
    },
    [updateRouteSettings],
  )

  /**
   * A sequência é derivada, nunca salva: os clientes são voláteis, então guardar a ordem
   * deixaria referências órfãs depois de um reload.
   */
  const activeRoute = useMemo(
    () =>
      routeSettings.enabled
        ? solveRoute(activePoints, { origin: routeSettings.origin, roundTrip: routeSettings.roundTrip })
        : null,
    [routeSettings.enabled, routeSettings.origin, routeSettings.roundTrip, activePoints],
  )

  const value: AreasContextType = {
    areas,
    activeArea,
    areaCounts,
    activePoints,
    activeInsights,
    drawingKind: draft?.kind ?? null,
    draft,
    draftCursor,
    setDraftCursor,
    draftGeometry,
    draftPoints,
    startDrawing,
    cancelDrawing,
    addDraftPoint,
    undoDraftPoint,
    finishDraft,
    canUndoDraft: drawing.canUndoDraft(draft),
    canFinishDraft: drawing.canFinishDraft(draft),
    draftStyle,
    isAreasPanelOpen,
    openAreasPanel,
    closeAreasPanel,
    toggleAreasPanel,
    createArea,
    selectArea,
    renameArea,
    updateStyle,
    routeSettings,
    activeRoute,
    updateRouteSettings,
    isPickingOrigin,
    startPickingOrigin: () => setIsPickingOrigin(true),
    cancelPickingOrigin: () => setIsPickingOrigin(false),
    setRouteOrigin,
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
