"use client"

import { Circle as CircleIcon, Hexagon, X } from "lucide-react"

import { AreaInsightsCard } from "@/components/areas/area-insights-card"
import { useAreas } from "@/components/areas/areas-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AreaKind } from "@/types/area"

const formatNumber = (value: number) => value.toLocaleString("pt-BR")

const DRAW_HINTS: Record<AreaKind, string> = {
  circle: "Clique no centro, depois clique de novo para definir o raio. Esc cancela.",
  polygon: "Clique para marcar os vértices. Feche no primeiro ponto ou aperte Enter. Esc cancela.",
}

export function AreaToolbar() {
  const { areas, activeArea, areaCounts, drawingKind, startDrawing, cancelDrawing, selectArea } = useAreas()

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

        {drawingKind && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-accent px-2.5 py-2">
            <p className="flex-1 text-[11px] leading-snug text-accent-foreground">{DRAW_HINTS[drawingKind]}</p>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 shrink-0 cursor-pointer"
              title="Cancelar desenho"
              onClick={cancelDrawing}
            >
              <X className="h-3 w-3" />
            </Button>
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
