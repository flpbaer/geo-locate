/** Campos de localização resolvidos por geocodificação reversa (ou vindos do CSV). */
export interface PointLocation {
    city?: string
    state?: string
    address?: string
    neighborhood?: string
    postalCode?: string
    /** Identificador do local no Google, usado para montar links precisos. */
    placeId?: string
  }

  export interface Point extends PointLocation {
    id: string
    name: string
    lat: number
    lng: number
    description?: string
    category?: string
    color?: string
  }

  export interface CreatePointData extends PointLocation {
    name: string
    lat: number
    lng: number
    description?: string
    category?: string
    color?: string
  }

  export interface UpdatePointData extends PointLocation {
    name?: string
    lat?: number
    lng?: number
    description?: string
    category?: string
    color?: string
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
