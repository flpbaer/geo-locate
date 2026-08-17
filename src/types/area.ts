export interface LatLng {
  lat: number
  lng: number
}

/** Aparência da forma no mapa, editável por área. */
export interface AreaStyle {
  strokeColor: string
  fillColor: string
  /** Opacidade do preenchimento, de 0 a 1. */
  fillOpacity: number
  /** Espessura da borda em pixels. */
  strokeWeight: number
}

interface AreaBase {
  id: string
  name: string
  createdAt: number
  /** Ausente nas áreas salvas antes deste campo existir — ver `resolveAreaStyle`. */
  style?: AreaStyle
}

/** Área circular: o caso mais comum — "clientes num raio de X km daqui". */
export interface CircleArea extends AreaBase {
  kind: "circle"
  center: LatLng
  /** Raio em metros. */
  radius: number
}

/** Área livre, para territórios que não cabem num círculo (bairro, zona, carteira). */
export interface PolygonArea extends AreaBase {
  kind: "polygon"
  path: LatLng[]
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

/** Alterações vindas do mapa (arraste/redimensionamento), da renomeação ou da aparência. */
export interface AreaPatch {
  name?: string
  center?: LatLng
  radius?: number
  path?: LatLng[]
  style?: AreaStyle
}

export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  circle: "Raio",
  polygon: "Polígono",
}
