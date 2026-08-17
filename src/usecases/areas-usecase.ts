import { areaCenter, areaSizeKm2, distanceInMeters, isInsideArea } from "@/lib/geo"
import type { Area, LatLng } from "@/types/area"
import type { Point } from "@/types/point"
import { pointsUseCase, type LocationInsights, type LocationStat } from "@/usecases/points-usecase"

export interface AreaInsights {
  /** Clientes dentro da área. */
  total: number
  /** Participação da área na base completa, em %. */
  shareOfBase: number
  sizeKm2: number
  /** Clientes por km². */
  density: number
  center: LatLng
  /** Distância média dos clientes ao centro da área, em metros. */
  avgDistanceFromCenter: number
  farthest: { point: Point; distance: number } | null
  nearest: { point: Point; distance: number } | null
  /** Maior distância entre dois clientes da área — o "diâmetro" real da carteira. */
  spread: number
  /** Rankings por estado/cidade/região, restritos à área. */
  location: LocationInsights
  categories: LocationStat[]
}

export interface IAreasUseCase {
  pointsInArea(points: Point[], area: Area): Point[]
  buildAreaInsights(points: Point[], area: Area, baseTotal: number): AreaInsights
  countByArea(points: Point[], areas: Area[]): Record<string, number>
}

export class AreasUseCase implements IAreasUseCase {
  pointsInArea(points: Point[], area: Area): Point[] {
    return points.filter((point) => isInsideArea({ lat: point.lat, lng: point.lng }, area))
  }

  countByArea(points: Point[], areas: Area[]): Record<string, number> {
    const counts: Record<string, number> = {}

    areas.forEach((area) => {
      counts[area.id] = this.pointsInArea(points, area).length
    })

    return counts
  }

  /**
   * Métricas da área. `points` já deve estar restrito à área; `baseTotal` é o total da
   * base completa, usado só para calcular a participação.
   */
  buildAreaInsights(points: Point[], area: Area, baseTotal: number): AreaInsights {
    const center = areaCenter(area)
    const sizeKm2 = areaSizeKm2(area)
    const total = points.length

    let distanceSum = 0
    let farthest: { point: Point; distance: number } | null = null
    let nearest: { point: Point; distance: number } | null = null

    points.forEach((point) => {
      const distance = distanceInMeters(center, { lat: point.lat, lng: point.lng })
      distanceSum += distance

      if (!farthest || distance > farthest.distance) farthest = { point, distance }
      if (!nearest || distance < nearest.distance) nearest = { point, distance }
    })

    return {
      total,
      shareOfBase: baseTotal > 0 ? (total / baseTotal) * 100 : 0,
      sizeKm2,
      density: sizeKm2 > 0 ? total / sizeKm2 : 0,
      center,
      avgDistanceFromCenter: total > 0 ? distanceSum / total : 0,
      farthest,
      nearest,
      spread: this.computeSpread(points),
      location: pointsUseCase.buildLocationInsights(points),
      categories: this.buildCategoryStats(points),
    }
  }

  /**
   * Maior distância entre dois clientes da área. O(n²) — acima de MAX_SPREAD_POINTS
   * clientes retorna 0 em vez de travar a UI, e o painel omite a métrica.
   */
  private computeSpread(points: Point[]): number {
    const MAX_SPREAD_POINTS = 400
    if (points.length < 2 || points.length > MAX_SPREAD_POINTS) return 0

    let max = 0

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const distance = distanceInMeters(
          { lat: points[i].lat, lng: points[i].lng },
          { lat: points[j].lat, lng: points[j].lng },
        )
        if (distance > max) max = distance
      }
    }

    return max
  }

  private buildCategoryStats(points: Point[]): LocationStat[] {
    const total = points.length
    const counts = new Map<string, number>()

    points.forEach((point) => {
      const category = point.category?.trim()
      if (!category) return
      counts.set(category, (counts.get(category) ?? 0) + 1)
    })

    return Array.from(counts.entries())
      .map(([category, count]) => ({
        key: category,
        label: category,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
  }
}

export const areasUseCase = new AreasUseCase()
