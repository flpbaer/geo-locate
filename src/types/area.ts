export interface LatLng {
  lat: number
  lng: number
}

/** Área circular: o caso mais comum — "clientes num raio de X km daqui". */
export interface CircleArea {
  id: string
  name: string
  kind: "circle"
  center: LatLng
  /** Raio em metros. */
  radius: number
  createdAt: number
}

/** Área livre, para territórios que não cabem num círculo (bairro, zona, carteira). */
export interface PolygonArea {
  id: string
  name: string
  kind: "polygon"
  path: LatLng[]
  createdAt: number
}

export type Area = CircleArea | PolygonArea

export type AreaKind = Area["kind"]

/** `Omit` sobre união colapsa para as chaves comuns; esta versão distribui pelos membros. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Geometria de uma área nova, antes de receber id/nome/data. */
export type AreaDraft = DistributiveOmit<Area, "id" | "name" | "createdAt"> & { name?: string }

/**
 * Desenho em andamento. Fica no provider (e não no componente do mapa) para que a
 * toolbar possa mostrar o progresso e oferecer desfazer/concluir/descartar.
 */
export interface DrawingDraft {
  kind: AreaKind
  /** Centro do círculo, depois do primeiro clique. */
  center: LatLng | null
  /** Vértices do polígono, na ordem em que foram marcados. */
  vertices: LatLng[]
}

/** Alterações vindas do mapa (arraste/redimensionamento) ou da renomeação. */
export interface AreaPatch {
  name?: string
  center?: LatLng
  radius?: number
  path?: LatLng[]
}

export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  circle: "Raio",
  polygon: "Polígono",
}
