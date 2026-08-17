"use client"

import { Check, Circle as CircleIcon, Hexagon, Trash2, Undo2 } from "lucide-react"

import { AreaInsightsCard } from "@/components/areas/area-insights-card"
import { useAreas } from "@/components/areas/areas-provider"
import { Button } from "@/components/ui/button"
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

export function AreaToolbar() {
  const {
    areas,
    activeArea,
    areaCounts,
    drawingKind,
    draft,
    startDrawing,
    cancelDrawing,
    undoDraftPoint,
    finishDraft,
    canUndoDraft,
    canFinishDraft,
    selectArea,
  } = useAreas()

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-h-[calc(100vh-2rem)] flex-col gap-3">
      <div className="pointer-events-auto w-[320px] rounded-xl border bg-card p-2 shadow-lg">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={drawingKind === "circle" ? "default" : "outline"}
            className="flex-1 cursor-pointer"
            onClick={() => (drawingKind === "circle" ? cancelDrawing() : startDrawing("circle"))}
          >
            <CircleIcon className="mr-1.5 h-3.5 w-3.5" />
            Raio
          </Button>
          <Button
            size="sm"
            variant={drawingKind === "polygon" ? "default" : "outline"}
            className="flex-1 cursor-pointer"
            onClick={() => (drawingKind === "polygon" ? cancelDrawing() : startDrawing("polygon"))}
          >
            <Hexagon className="mr-1.5 h-3.5 w-3.5" />
            Polígono
          </Button>
        </div>

        {draft && (
          <div className="mt-2 rounded-lg bg-accent px-2.5 py-2">
            <p className="text-[11px] leading-snug text-accent-foreground">{draftStatus(draft)}</p>

            <div className="mt-2 flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 cursor-pointer px-2 text-[11px]"
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
                  className="h-7 flex-1 cursor-pointer px-2 text-[11px]"
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
                className="h-7 cursor-pointer px-2 text-[11px] text-destructive hover:text-destructive"
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
          <ul className="mt-2 max-h-[180px] space-y-0.5 overflow-y-auto">
            {areas.map((area) => {
              const isActive = activeArea?.id === area.id

              return (
                <li key={area.id}>
                  <button
                    type="button"
                    onClick={() => selectArea(isActive ? null : area.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60",
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
        )}
      </div>

      <div className="pointer-events-auto min-h-0">
        <AreaInsightsCard />
      </div>
    </div>
  )
}
