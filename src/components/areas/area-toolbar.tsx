"use client"

import { Check, Minus, Trash2, Undo2 } from "lucide-react"
import { useEffect } from "react"

import { AreaInsightsCard } from "@/components/areas/area-insights-card"
import { useAreas } from "@/components/areas/areas-provider"
import { useGps } from "@/components/gps/gps-provider"
import { useMapPoints } from "@/components/map-points-provider"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"
import { resolveAreaStyle } from "@/lib/area-style"
import { cn } from "@/lib/utils"
import type { DrawingDraft } from "@/types/area"

const formatNumber = (value: number) => value.toLocaleString("pt-BR")

/** Diz onde o desenho está e o que falta para concluir. */
function draftStatus(draft: DrawingDraft): string {
  if (draft.kind === "circle") {
    return draft.center ? "Centro definido — clique para fixar o raio." : "Clique no mapa para definir o centro."
  }

  const count = draft.vertices.length

  if (count === 0) return "Clique no mapa para marcar o primeiro vértice."
  if (count < 3) return `${count} de 3 vértices — mínimo para fechar uma área.`

  return `${count} vértices — feche no primeiro ponto ou aperte Enter.`
}

/** O número que decide o raio: quantos clientes a forma provisória já pega. */
function draftCapture(count: number): string {
  if (count === 0) return "Nenhum cliente dentro do traçado até aqui."
  return `${formatNumber(count)} cliente(s) dentro — em destaque no mapa.`
}

/**
 * Lista de áreas e painel da área ativa.
 *
 * Criar área saiu daqui para o menu em disco (`MapActions`): o que sobra é o que precisa
 * ficar à vista enquanto se trabalha — e, sem áreas nem desenho em curso, nada aparece.
 */
export function AreaToolbar() {
  const {
    areas,
    activeArea,
    areaCounts,
    draft,
    draftGeometry,
    draftPoints,
    cancelDrawing,
    undoDraftPoint,
    finishDraft,
    canUndoDraft,
    canFinishDraft,
    selectArea,
    isAreasPanelOpen,
    closeAreasPanel,
  } = useAreas()
  const { isEnabled: isGpsEnabled } = useGps()
  const { points } = useMapPoints()
  const isMobile = useIsMobile()

  // Entrar no modo GPS devolve o mapa: no celular os dois painéis juntos não caberiam.
  useEffect(() => {
    if (isGpsEnabled && isMobile) closeAreasPanel()
  }, [isGpsEnabled, isMobile, closeAreasPanel])

  // Sem base não há o que roteirizar nem contar: o painel some junto com as formas.
  if (points.length === 0) return null
  if (!isAreasPanelOpen || (!draft && areas.length === 0)) return null

  return (
    // Começa abaixo dos botões redondos do topo, que ocupam os dois cantos.
    <div className="pointer-events-none absolute left-3 right-3 top-[4.5rem] z-10 flex max-h-[calc(100dvh-5.5rem)] flex-col gap-2 md:left-4 md:right-auto md:top-4 md:max-h-[calc(100dvh-2rem)] md:gap-3">
      <div className="pointer-events-auto w-full rounded-xl border bg-card p-2 shadow-lg md:w-[320px]">
        {draft && (
          <div className="rounded-lg bg-accent px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] leading-snug text-accent-foreground">{draftStatus(draft)}</p>
              {areas.length === 0 && (
                <button
                  type="button"
                  className="-mr-1 -mt-0.5 shrink-0 cursor-pointer rounded p-1 text-accent-foreground/70 hover:bg-background/60 hover:text-accent-foreground"
                  title="Minimizar — reabra pelo botão de mais"
                  onClick={closeAreasPanel}
                >
                  <Minus className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Sem forma ainda (círculo sem raio, polígono com 2 vértices) não há o que
                contar — a linha só aparece quando o número já significa alguma coisa. */}
            {draftGeometry && (
              <p className="mt-1.5 text-[11px] font-semibold leading-snug tabular-nums text-accent-foreground">
                {draftCapture(draftPoints.length)}
              </p>
            )}

            <div className="mt-2 flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 flex-1 cursor-pointer px-2 text-[11px] md:h-7"
                disabled={!canUndoDraft}
                title="Desfazer o último ponto (Ctrl+Z)"
                onClick={undoDraftPoint}
              >
                <Undo2 className="mr-1 h-3 w-3" />
                Desfazer
              </Button>

              {draft.kind === "polygon" && (
                <Button
                  size="sm"
                  className="h-8 flex-1 cursor-pointer px-2 text-[11px] md:h-7"
                  disabled={!canFinishDraft}
                  title="Fechar a área (Enter)"
                  onClick={finishDraft}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Concluir
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="h-8 cursor-pointer px-2 text-[11px] text-destructive hover:text-destructive md:h-7"
                title="Descartar o desenho (Esc)"
                onClick={cancelDrawing}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Descartar
              </Button>
            </div>
          </div>
        )}

        {areas.length > 0 && (
          <>
            <div className={cn("flex items-center justify-between gap-2 px-1 pb-1", draft && "pt-2")}>
              <span className="text-[11px] font-medium text-muted-foreground">
                Áreas ({formatNumber(areas.length)})
              </span>
              <button
                type="button"
                className="-mr-1 cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Minimizar — reabra pelo botão de mais"
                onClick={closeAreasPanel}
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>

            <ul className="max-h-[132px] space-y-0.5 overflow-y-auto md:max-h-[180px]">
              {areas.map((area) => {
                const isActive = activeArea?.id === area.id

                return (
                  <li key={area.id}>
                    <button
                      type="button"
                      onClick={() => selectArea(isActive ? null : area.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/60 md:py-1.5",
                        isActive && "bg-accent",
                      )}
                    >
                      {/* A cor identifica a área na lista; o nome e a contagem seguem ao
                          lado, para que a identidade nunca dependa só da cor. */}
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border"
                        style={{
                          backgroundColor: resolveAreaStyle(area).fillColor,
                          borderColor: resolveAreaStyle(area).strokeColor,
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{area.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {formatNumber(areaCounts[area.id] ?? 0)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <div className="pointer-events-auto min-h-0">
        <AreaInsightsCard />
      </div>
    </div>
  )
}
