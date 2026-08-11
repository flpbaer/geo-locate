import { getStateName, getStateRegion, normalizeCityKey, normalizeText, toStateCode } from "@/lib/br-states"
import { findCSVColumns, parseCSVLine, valueAt } from "@/lib/csv"
import type { Point, CreatePointData, UpdatePointData, PointFilters } from "@/types/point"

export interface IPointsRepository {
  getAll(): Promise<Point[]>
  getById(id: string): Promise<Point | null>
  create(data: CreatePointData): Promise<Point>
  update(id: string, data: UpdatePointData): Promise<Point>
  updateMany(updates: { id: string; data: UpdatePointData }[]): Promise<Point[]>
  delete(id: string): Promise<void>
  deleteAll(): Promise<void>
  search(query: string): Promise<Point[]>
}

export interface LocationStat {
  key: string
  label: string
  sublabel?: string
  count: number
  percentage: number
}

export interface LocationInsights {
  total: number
  located: number
  unlocated: number
  states: LocationStat[]
  cities: LocationStat[]
  regions: LocationStat[]
}

export interface RegionGroup {
  id: string
  name: string
  points: Point[]
  center: { lat: number; lng: number }
  bounds: {
    north: number
    south: number
    east: number
    west: number
  }
}

export interface IPointsUseCase {
  getAllPoints(): Promise<Point[]>
  getPointById(id: string): Promise<Point | null>
  createPoint(data: CreatePointData): Promise<Point>
  createMultiplePoints(data: CreatePointData[]): Promise<Point[]>
  updatePoint(id: string, data: UpdatePointData): Promise<Point>
  updateManyPoints(updates: { id: string; data: UpdatePointData }[]): Promise<Point[]>
  deletePoint(id: string): Promise<void>
  deleteAllPoints(): Promise<void>
  searchPoints(query: string): Promise<Point[]>
  filterPoints(points: Point[], filters: PointFilters): Point[]
  validatePoint(data: CreatePointData): { isValid: boolean; errors: string[] }
  exportPointsToCSV(points: Point[]): string
  importPointsFromCSV(csvContent: string): Promise<Point[]>
  groupPointsByRegion(points: Point[], maxRegions?: number): RegionGroup[]
  groupPointsByCategory(points: Point[]): Record<string, Point[]>
  groupPointsByQuadrant(points: Point[]): Record<string, Point[]>
  groupPointsByState(points: Point[]): Record<string, Point[]>
  groupPointsByCity(points: Point[]): Record<string, Point[]>
  buildLocationInsights(points: Point[]): LocationInsights
}

class InMemoryPointsRepository implements IPointsRepository {
  private points: Point[] = []

  async getAll(): Promise<Point[]> {
    return [...this.points]
  }

  async getById(id: string): Promise<Point | null> {
    return this.points.find((point) => point.id === id) || null
  }

  async create(data: CreatePointData): Promise<Point> {
    const point: Point = {
      ...data,
      id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }
    this.points.push(point)
    return point
  }

  async update(id: string, data: UpdatePointData): Promise<Point> {
    const index = this.points.findIndex((point) => point.id === id)
    if (index === -1) {
      throw new Error(`Point with id ${id} not found`)
    }

    const updatedPoint: Point = {
      ...this.points[index],
      ...data,
    }

    this.points[index] = updatedPoint
    return updatedPoint
  }

  async updateMany(updates: { id: string; data: UpdatePointData }[]): Promise<Point[]> {
    const byId = new Map(updates.map((update) => [update.id, update.data]))

    this.points = this.points.map((point) => {
      const data = byId.get(point.id)
      return data ? { ...point, ...data } : point
    })

    return this.points.filter((point) => byId.has(point.id))
  }

  async delete(id: string): Promise<void> {
    const index = this.points.findIndex((point) => point.id === id)
    if (index === -1) {
      throw new Error(`Point with id ${id} not found`)
    }
    this.points.splice(index, 1)
  }

  async deleteAll(): Promise<void> {
    this.points = []
  }

  async search(query: string): Promise<Point[]> {
    const lowercaseQuery = query.toLowerCase()
    return this.points.filter(
      (point) =>
        point.name.toLowerCase().includes(lowercaseQuery) ||
        point.description?.toLowerCase().includes(lowercaseQuery) ||
        point.category?.toLowerCase().includes(lowercaseQuery),
    )
  }
}

export class PointsUseCase implements IPointsUseCase {
  constructor(private repository: IPointsRepository) {}

  async getAllPoints(): Promise<Point[]> {
    return this.repository.getAll()
  }

  async getPointById(id: string): Promise<Point | null> {
    return this.repository.getById(id)
  }

  async createPoint(data: CreatePointData): Promise<Point> {
    const validation = this.validatePoint(data)
    if (!validation.isValid) {
      throw new Error(`Invalid point data: ${validation.errors.join(", ")}`)
    }
    return this.repository.create(data)
  }

  async createMultiplePoints(data: CreatePointData[]): Promise<Point[]> {
    const results: Point[] = []
    const errors: string[] = []

    for (const pointData of data) {
      try {
        const point = await this.createPoint(pointData)
        results.push(point)
      } catch (error) {
        errors.push(
          `Failed to create point ${pointData.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
      }
    }

    if (errors.length > 0) {
      console.warn("Some points failed to create:", errors)
    }

    return results
  }

  async updatePoint(id: string, data: UpdatePointData): Promise<Point> {
    return this.repository.update(id, data)
  }

  async updateManyPoints(updates: { id: string; data: UpdatePointData }[]): Promise<Point[]> {
    if (updates.length === 0) return []
    return this.repository.updateMany(updates)
  }

  async deletePoint(id: string): Promise<void> {
    return this.repository.delete(id)
  }

  async deleteAllPoints(): Promise<void> {
    return this.repository.deleteAll()
  }

  async searchPoints(query: string): Promise<Point[]> {
    if (!query.trim()) {
      return this.getAllPoints()
    }
    return this.repository.search(query)
  }

  filterPoints(points: Point[], filters: PointFilters): Point[] {
    let filtered = [...points]

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (point) =>
          point.name.toLowerCase().includes(searchLower) ||
          point.description?.toLowerCase().includes(searchLower) ||
          point.category?.toLowerCase().includes(searchLower),
      )
    }

    if (filters.category) {
      filtered = filtered.filter((point) => point.category === filters.category)
    }

    if (filters.state) {
      filtered = filtered.filter((point) => toStateCode(point.state) === toStateCode(filters.state))
    }

    if (filters.city) {
      const cityLower = normalizeText(filters.city)
      filtered = filtered.filter((point) => point.city && normalizeText(point.city) === cityLower)
    }

    if (filters.bounds) {
      const { north, south, east, west } = filters.bounds
      filtered = filtered.filter(
        (point) => point.lat <= north && point.lat >= south && point.lng <= east && point.lng >= west,
      )
    }

    return filtered
  }

  validatePoint(data: CreatePointData): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.name || data.name.trim().length === 0) {
      errors.push("Name is required")
    }

    if (typeof data.lat !== "number" || isNaN(data.lat)) {
      errors.push("Latitude must be a valid number")
    } else if (data.lat < -90 || data.lat > 90) {
      errors.push("Latitude must be between -90 and 90")
    }

    if (typeof data.lng !== "number" || isNaN(data.lng)) {
      errors.push("Longitude must be a valid number")
    } else if (data.lng < -180 || data.lng > 180) {
      errors.push("Longitude must be between -180 and 180")
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  exportPointsToCSV(points: Point[]): string {
    const headers = ["name", "lat", "lng", "description", "category", "color", "cidade", "estado"]

    if (points.length === 0) {
      return headers.join(",")
    }

    const escape = (value?: string) => `"${(value || "").replace(/"/g, '""')}"`

    const csvContent = [
      headers.join(","),
      ...points.map((point) =>
        [
          escape(point.name),
          point.lat.toString(),
          point.lng.toString(),
          escape(point.description),
          escape(point.category),
          escape(point.color),
          escape(point.city),
          escape(point.state),
        ].join(","),
      ),
    ].join("\n")

    return csvContent
  }

  async importPointsFromCSV(csvContent: string): Promise<Point[]> {
    const lines = csvContent.split("\n").filter((line) => line.trim())

    if (lines.length < 2) {
      throw new Error("CSV must have at least a header and one data row")
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase())
    const columns = findCSVColumns(headers)

    if (columns.name === -1 || columns.lat === -1 || columns.lng === -1) {
      throw new Error("CSV must contain name, lat, and lng columns")
    }

    const pointsData: CreatePointData[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])

      if (values.length < 3) continue

      const lat = Number.parseFloat(values[columns.lat])
      const lng = Number.parseFloat(values[columns.lng])
      const name = values[columns.name] || `Point ${i}`

      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Row ${i + 1}: Invalid coordinates`)
        continue
      }

      const state = valueAt(values, columns.state)

      pointsData.push({
        name,
        lat,
        lng,
        description: valueAt(values, columns.description),
        category: valueAt(values, columns.category),
        color: valueAt(values, columns.color),
        city: valueAt(values, columns.city),
        state: toStateCode(state) ?? state,
      })
    }

    return this.createMultiplePoints(pointsData)
  }

  groupPointsByRegion(points: Point[], maxRegions = 4): RegionGroup[] {
    if (points.length === 0) return []
    if (points.length <= maxRegions) {
      return points.map((point) => ({
        id: `region-${point.id}`,
        name: point.name,
        points: [point],
        center: { lat: point.lat, lng: point.lng },
        bounds: {
          north: point.lat + 0.01,
          south: point.lat - 0.01,
          east: point.lng + 0.01,
          west: point.lng - 0.01,
        },
      }))
    }

    const centers: { lat: number; lng: number }[] = []

    let minLat = points[0].lat
    let maxLat = points[0].lat
    let minLng = points[0].lng
    let maxLng = points[0].lng

    points.forEach((point) => {
      minLat = Math.min(minLat, point.lat)
      maxLat = Math.max(maxLat, point.lat)
      minLng = Math.min(minLng, point.lng)
      maxLng = Math.max(maxLng, point.lng)
    })

    for (let i = 0; i < maxRegions; i++) {
      centers.push({
        lat: minLat + ((maxLat - minLat) * (i + 0.5)) / maxRegions,
        lng: minLng + ((maxLng - minLng) * ((i % 2) + 0.5)) / 2,
      })
    }

    const clusters: Point[][] = Array(maxRegions)
      .fill(null)
      .map(() => [])

    for (let iteration = 0; iteration < 5; iteration++) {
      clusters.forEach((cluster) => (cluster.length = 0))

      points.forEach((point) => {
        let minDist = Number.POSITIVE_INFINITY
        let closestCenter = 0

        centers.forEach((center, i) => {
          const dist = this.calculateDistance(point, center)
          if (dist < minDist) {
            minDist = dist
            closestCenter = i
          }
        })

        clusters[closestCenter].push(point)
      })

      centers.forEach((center, i) => {
        if (clusters[i].length > 0) {
          const sumLat = clusters[i].reduce((sum, p) => sum + p.lat, 0)
          const sumLng = clusters[i].reduce((sum, p) => sum + p.lng, 0)
          center.lat = sumLat / clusters[i].length
          center.lng = sumLng / clusters[i].length
        }
      })
    }

    return clusters
      .map((cluster, i) => {
        if (cluster.length === 0) return null

        let north = -90,
          south = 90,
          east = -180,
          west = 180
        cluster.forEach((point) => {
          north = Math.max(north, point.lat)
          south = Math.min(south, point.lat)
          east = Math.max(east, point.lng)
          west = Math.min(west, point.lng)
        })

        let regionName = ""
        if (north > 0 && south > 0) regionName = "Norte"
        else if (north < 0 && south < 0) regionName = "Sul"
        else regionName = "Central"

        if (east > 0 && west > 0) regionName += " Leste"
        else if (east < 0 && west < 0) regionName += " Oeste"
        else regionName += " Central"

        regionName = `Região ${i + 1}: ${regionName}`

        return {
          id: `region-${i}`,
          name: regionName,
          points: cluster,
          center: centers[i],
          bounds: { north, south, east, west },
        }
      })
      .filter((region): region is RegionGroup => region !== null)
  }

  groupPointsByCategory(points: Point[]): Record<string, Point[]> {
    const groups: Record<string, Point[]> = {}

    points.forEach((point) => {
      const category = point.category || "Sem Categoria"
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(point)
    })

    return groups
  }

  groupPointsByQuadrant(points: Point[]): Record<string, Point[]> {
    const quadrants: Record<string, Point[]> = {
      Nordeste: [],
      Noroeste: [],
      Sudeste: [],
      Sudoeste: [],
    }

    points.forEach((point) => {
      if (point.lat >= 0 && point.lng >= 0) {
        quadrants["Nordeste"].push(point)
      } else if (point.lat >= 0 && point.lng < 0) {
        quadrants["Noroeste"].push(point)
      } else if (point.lat < 0 && point.lng >= 0) {
        quadrants["Sudeste"].push(point)
      } else {
        quadrants["Sudoeste"].push(point)
      }
    })

    Object.keys(quadrants).forEach((key) => {
      if (quadrants[key].length === 0) {
        delete quadrants[key]
      }
    })

    return quadrants
  }

  groupPointsByState(points: Point[]): Record<string, Point[]> {
    const groups: Record<string, Point[]> = {}

    points.forEach((point) => {
      const uf = toStateCode(point.state)
      if (!uf) return
      if (!groups[uf]) groups[uf] = []
      groups[uf].push(point)
    })

    return groups
  }

  groupPointsByCity(points: Point[]): Record<string, Point[]> {
    const groups: Record<string, Point[]> = {}

    points.forEach((point) => {
      if (!point.city) return
      const uf = toStateCode(point.state)
      const key = uf ? `${point.city} - ${uf}` : point.city
      if (!groups[key]) groups[key] = []
      groups[key].push(point)
    })

    return groups
  }

  /**
   * Consolida os rankings usados pelo painel de insights. O percentual sempre usa o
   * total de clientes (e não o total localizado), para que a soma reflita a base real.
   */
  buildLocationInsights(points: Point[]): LocationInsights {
    const total = points.length
    const percentageOf = (count: number) => (total > 0 ? (count / total) * 100 : 0)

    const stateCounts = new Map<string, number>()
    const regionCounts = new Map<string, number>()
    const cityCounts = new Map<string, { label: string; sublabel?: string; count: number }>()
    let located = 0

    points.forEach((point) => {
      const uf = toStateCode(point.state)
      const hasCity = Boolean(point.city)

      if (uf || hasCity) located++

      if (uf) {
        stateCounts.set(uf, (stateCounts.get(uf) ?? 0) + 1)
        const region = getStateRegion(uf)
        if (region) regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1)
      }

      if (point.city) {
        const key = normalizeCityKey(point.city, uf)
        const existing = cityCounts.get(key)
        if (existing) {
          existing.count++
        } else {
          cityCounts.set(key, {
            label: point.city,
            sublabel: uf ? getStateName(uf) : undefined,
            count: 1,
          })
        }
      }
    })

    const byCountDesc = (a: LocationStat, b: LocationStat) =>
      b.count - a.count || a.label.localeCompare(b.label, "pt-BR")

    const states: LocationStat[] = Array.from(stateCounts.entries())
      .map(([uf, count]) => ({
        key: uf,
        label: getStateName(uf),
        sublabel: uf,
        count,
        percentage: percentageOf(count),
      }))
      .sort(byCountDesc)

    const cities: LocationStat[] = Array.from(cityCounts.entries())
      .map(([key, city]) => ({
        key,
        label: city.label,
        sublabel: city.sublabel,
        count: city.count,
        percentage: percentageOf(city.count),
      }))
      .sort(byCountDesc)

    const regions: LocationStat[] = Array.from(regionCounts.entries())
      .map(([region, count]) => ({
        key: region,
        label: region,
        count,
        percentage: percentageOf(count),
      }))
      .sort(byCountDesc)

    return {
      total,
      located,
      unlocated: total - located,
      states,
      cities,
      regions,
    }
  }

  private calculateDistance(point: Point, center: { lat: number; lng: number }): number {
    const latDiff = point.lat - center.lat
    const lngDiff = point.lng - center.lng
    return latDiff * latDiff + lngDiff * lngDiff
  }
}
const pointsRepository = new InMemoryPointsRepository()
export const pointsUseCase = new PointsUseCase(pointsRepository)
