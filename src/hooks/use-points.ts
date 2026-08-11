"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import type { Point, CreatePointData, UpdatePointData, PointFilters, PointsState } from "@/types/point"
import { pointsUseCase } from "@/usecases/points-usecase"

export function usePoints() {
  const [state, setState] = useState<PointsState>({
    points: [],
    filteredPoints: [],
    selectedPoint: null,
    filters: {},
    isLoading: false,
    error: null,
  })

  const loadPoints = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const points = await pointsUseCase.getAllPoints()
      const filteredPoints = pointsUseCase.filterPoints(points, state.filters)
      setState((prev) => ({
        ...prev,
        points,
        filteredPoints,
        isLoading: false,
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to load points",
        isLoading: false,
      }))
    }
  }, [state.filters])

  const createPoint = useCallback(async (data: CreatePointData) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const newPoint = await pointsUseCase.createPoint(data)
      setState((prev) => {
        const points = [...prev.points, newPoint]
        const filteredPoints = pointsUseCase.filterPoints(points, prev.filters)
        return {
          ...prev,
          points,
          filteredPoints,
          isLoading: false,
        }
      })
      return newPoint
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to create point",
        isLoading: false,
      }))
      throw error
    }
  }, [])

  const createMultiplePoints = useCallback(async (data: CreatePointData[]) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const newPoints = await pointsUseCase.createMultiplePoints(data)
      setState((prev) => {
        const points = [...prev.points, ...newPoints]
        const filteredPoints = pointsUseCase.filterPoints(points, prev.filters)
        return {
          ...prev,
          points,
          filteredPoints,
          isLoading: false,
        }
      })
      return newPoints
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to create points",
        isLoading: false,
      }))
      throw error
    }
  }, [])

  const updatePoint = useCallback(async (id: string, data: UpdatePointData) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const updatedPoint = await pointsUseCase.updatePoint(id, data)
      setState((prev) => {
        const points = prev.points.map((p) => (p.id === id ? updatedPoint : p))
        const filteredPoints = pointsUseCase.filterPoints(points, prev.filters)
        return {
          ...prev,
          points,
          filteredPoints,
          selectedPoint: prev.selectedPoint?.id === id ? updatedPoint : prev.selectedPoint,
          isLoading: false,
        }
      })
      return updatedPoint
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to update point",
        isLoading: false,
      }))
      throw error
    }
  }, [])

  const updateManyPoints = useCallback(async (updates: { id: string; data: UpdatePointData }[]) => {
    if (updates.length === 0) return []

    try {
      const updated = await pointsUseCase.updateManyPoints(updates)
      const byId = new Map(updated.map((point) => [point.id, point]))
      setState((prev) => {
        const points = prev.points.map((point) => byId.get(point.id) ?? point)
        const filteredPoints = pointsUseCase.filterPoints(points, prev.filters)
        return {
          ...prev,
          points,
          filteredPoints,
          selectedPoint: prev.selectedPoint ? (byId.get(prev.selectedPoint.id) ?? prev.selectedPoint) : null,
        }
      })
      return updated
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to update points",
      }))
      throw error
    }
  }, [])

  const deletePoint = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      await pointsUseCase.deletePoint(id)
      setState((prev) => {
        const points = prev.points.filter((p) => p.id !== id)
        const filteredPoints = pointsUseCase.filterPoints(points, prev.filters)
        return {
          ...prev,
          points,
          filteredPoints,
          selectedPoint: prev.selectedPoint?.id === id ? null : prev.selectedPoint,
          isLoading: false,
        }
      })
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to delete point",
        isLoading: false,
      }))
      throw error
    }
  }, [])

  const deleteAllPoints = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      await pointsUseCase.deleteAllPoints()
      setState((prev) => ({
        ...prev,
        points: [],
        filteredPoints: [],
        selectedPoint: null,
        isLoading: false,
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to delete all points",
        isLoading: false,
      }))
      throw error
    }
  }, [])

  const searchPoints = useCallback(async (query: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const points = await pointsUseCase.searchPoints(query)
      setState((prev) => ({
        ...prev,
        filteredPoints: points,
        isLoading: false,
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to search points",
        isLoading: false,
      }))
    }
  }, [])

  const applyFilters = useCallback((filters: PointFilters) => {
    setState((prev) => {
      const filteredPoints = pointsUseCase.filterPoints(prev.points, filters)
      return {
        ...prev,
        filters,
        filteredPoints,
      }
    })
  }, [])

  const selectPoint = useCallback((point: Point | null) => {
    setState((prev) => ({ ...prev, selectedPoint: point }))
  }, [])

  const exportToCSV = useCallback(
    (points?: Point[]) => {
      const pointsToExport = points || state.points
      return pointsUseCase.exportPointsToCSV(pointsToExport)
    },
    [state.points],
  )

  const importFromCSV = useCallback(async (csvContent: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const importedPoints = await pointsUseCase.importPointsFromCSV(csvContent)
      setState((prev) => {
        const points = [...prev.points, ...importedPoints]
        const filteredPoints = pointsUseCase.filterPoints(points, prev.filters)
        return {
          ...prev,
          points,
          filteredPoints,
          isLoading: false,
        }
      })
      return importedPoints
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to import points",
        isLoading: false,
      }))
      throw error
    }
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  const regionGroups = useMemo(() => {
    return pointsUseCase.groupPointsByRegion(state.points)
  }, [state.points])

  const categoryGroups = useMemo(() => {
    return pointsUseCase.groupPointsByCategory(state.points)
  }, [state.points])

  const quadrantGroups = useMemo(() => {
    return pointsUseCase.groupPointsByQuadrant(state.points)
  }, [state.points])

  const locationInsights = useMemo(() => {
    return pointsUseCase.buildLocationInsights(state.points)
  }, [state.points])

  useEffect(() => {
    loadPoints()
  }, [])

  return {
    points: state.points,
    filteredPoints: state.filteredPoints,
    selectedPoint: state.selectedPoint,
    filters: state.filters,
    isLoading: state.isLoading,
    error: state.error,
    regionGroups,
    categoryGroups,
    quadrantGroups,
    locationInsights,
    loadPoints,
    createPoint,
    createMultiplePoints,
    updatePoint,
    updateManyPoints,
    deletePoint,
    deleteAllPoints,
    searchPoints,
    applyFilters,
    selectPoint,
    exportToCSV,
    importFromCSV,
    clearError,
  }
}
