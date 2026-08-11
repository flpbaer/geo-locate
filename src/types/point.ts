export interface Point {
    id: string
    name: string
    lat: number
    lng: number
    description?: string
    category?: string
    color?: string
    city?: string
    state?: string
  }

  export interface CreatePointData {
    name: string
    lat: number
    lng: number
    description?: string
    category?: string
    color?: string
    city?: string
    state?: string
  }

  export interface UpdatePointData {
    name?: string
    lat?: number
    lng?: number
    description?: string
    category?: string
    color?: string
    city?: string
    state?: string
  }

  export interface PointFilters {
    search?: string
    category?: string
    state?: string
    city?: string
    bounds?: {
      north: number
      south: number
      east: number
      west: number
    }
  }

  export interface PointsState {
    points: Point[]
    filteredPoints: Point[]
    selectedPoint: Point | null
    filters: PointFilters
    isLoading: boolean
    error: string | null
  }
