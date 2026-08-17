import { distanceInMeters } from "@/lib/geo"
import type { AreaDraft, AreaKind, DrawingDraft, LatLng } from "@/types/area"

/** Mínimo de vértices para um polígono delimitar alguma área. */
export const MIN_POLYGON_VERTICES = 3

export function startDraft(kind: AreaKind): DrawingDraft {
  return { kind, center: null, vertices: [] }
}

/**
 * Resultado de um clique: o desenho que segue em andamento e, quando o clique conclui
 * a forma, a área pronta para ser criada.
 */
export interface AddPointResult {
  draft: DrawingDraft
  completed: AreaDraft | null
}

/**
 * Avança o desenho com um clique do mapa. No círculo, o primeiro clique fixa o centro
 * e o segundo conclui pelo raio; no polígono, cada clique acrescenta um vértice.
 */
export function addDraftPoint(draft: DrawingDraft, point: LatLng): AddPointResult {
  if (draft.kind === "circle") {
    if (!draft.center) {
      return { draft: { ...draft, center: point }, completed: null }
    }

    const radius = distanceInMeters(draft.center, point)

    // Clique repetido no centro não define raio nenhum: mantém o desenho aberto.
    if (radius <= 0) return { draft, completed: null }

    return { draft, completed: { kind: "circle", center: draft.center, radius } }
  }

  return { draft: { ...draft, vertices: [...draft.vertices, point] }, completed: null }
}

/** Remove o último ponto marcado. Sem pontos, devolve o desenho intacto. */
export function undoDraftPoint(draft: DrawingDraft): DrawingDraft {
  if (draft.kind === "circle") {
    return draft.center ? { ...draft, center: null } : draft
  }

  if (draft.vertices.length === 0) return draft

  return { ...draft, vertices: draft.vertices.slice(0, -1) }
}

export function canUndoDraft(draft: DrawingDraft | null): boolean {
  if (!draft) return false
  return draft.center !== null || draft.vertices.length > 0
}

export function canFinishDraft(draft: DrawingDraft | null): boolean {
  return draft?.kind === "polygon" && draft.vertices.length >= MIN_POLYGON_VERTICES
}

/** Fecha um polígono válido, ou devolve null quando ainda não dá para fechar. */
export function finishDraft(draft: DrawingDraft | null): AreaDraft | null {
  if (!canFinishDraft(draft) || !draft) return null
  return { kind: "polygon", path: draft.vertices }
}
