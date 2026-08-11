"use client"

import type React from "react"
import { createContext, useContext } from "react"
import { usePoints } from "@/hooks/use-points"
import type { Point, CreatePointData, UpdatePointData, PointFilters } from "@/types/point"
import type { LocationInsights, RegionGroup } from "@/usecases/points-usecase"

interface MapPointsContextType {
  points: Point[]
  filteredPoints: Point[]
  selectedPoint: Point | null
  filters: PointFilters
  isLoading: boolean
  error: string | null
  regionGroups: RegionGroup[]
  categoryGroups: Record<string, Point[]>
  quadrantGroups: Record<string, Point[]>
  locationInsights: LocationInsights
  loadPoints: () => Promise<void>
  createPoint: (data: CreatePointData) => Promise<Point>
  createMultiplePoints: (data: CreatePointData[]) => Promise<Point[]>
  updatePoint: (id: string, data: UpdatePointData) => Promise<Point>
  updateManyPoints: (updates: { id: string; data: UpdatePointData }[]) => Promise<Point[]>
  deletePoint: (id: string) => Promise<void>
  deleteAllPoints: () => Promise<void>
  searchPoints: (query: string) => Promise<void>
  applyFilters: (filters: PointFilters) => void
  selectPoint: (point: Point | null) => void
  exportToCSV: (points?: Point[]) => string
  importFromCSV: (csvContent: string) => Promise<Point[]>
  clearError: () => void
  importedPoints: Point[]
  setImportedPoints: (points: Point[]) => Promise<Point[]>
  clearPoints: () => Promise<void>
}

const MapPointsContext = createContext<MapPointsContextType | undefined>(undefined)

export function MapPointsProvider({ children }: { children: React.ReactNode }) {
  const pointsHook = usePoints()

  const setImportedPoints = async (points: Point[]) => {
    await pointsHook.deleteAllPoints()
    const createData: CreatePointData[] = points.map((point) => ({
      name: point.name,
      lat: point.lat,
      lng: point.lng,
      description: point.description,
      category: point.category,
      color: point.color,
    }))
    return pointsHook.createMultiplePoints(createData)
  }

  const clearPoints = async () => {
    await pointsHook.deleteAllPoints()
  }

  const contextValue: MapPointsContextType = {
    points: pointsHook.points,
    filteredPoints: pointsHook.filteredPoints,
    selectedPoint: pointsHook.selectedPoint,
    filters: pointsHook.filters,
    isLoading: pointsHook.isLoading,
    error: pointsHook.error,
    regionGroups: pointsHook.regionGroups,
    categoryGroups: pointsHook.categoryGroups,
    quadrantGroups: pointsHook.quadrantGroups,
    locationInsights: pointsHook.locationInsights,
    loadPoints: pointsHook.loadPoints,
    createPoint: pointsHook.createPoint,
    createMultiplePoints: pointsHook.createMultiplePoints,
    updatePoint: pointsHook.updatePoint,
    updateManyPoints: pointsHook.updateManyPoints,
    deletePoint: pointsHook.deletePoint,
    deleteAllPoints: pointsHook.deleteAllPoints,
    searchPoints: pointsHook.searchPoints,
    applyFilters: pointsHook.applyFilters,
    selectPoint: pointsHook.selectPoint,
    exportToCSV: pointsHook.exportToCSV,
    importFromCSV: pointsHook.importFromCSV,
    clearError: pointsHook.clearError,
    importedPoints: pointsHook.points,
    setImportedPoints,
    clearPoints,
  }

  return <MapPointsContext.Provider value={contextValue}>{children}</MapPointsContext.Provider>
}

export function useMapPoints() {
  const context = useContext(MapPointsContext)
  if (context === undefined) {
    throw new Error("useMapPoints must be used within a MapPointsProvider")
  }
  return context
}
