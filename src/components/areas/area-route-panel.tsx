"use client"

import { AlertCircle, Crosshair, Download, Flag, Loader2, MapPin, Route as RouteIcon, X } from "lucide-react"

import { useAreas } from "@/components/areas/areas-provider"
import { useRoadPath } from "@/components/areas/use-road-path"
import { useMapPoints } from "@/components/map-points-provider"
import { Button } from "@/components/ui/button"
import { formatDistance } from "@/lib/geo"
import { cn } from "@/lib/utils"

const formatNumber = (value: number) => value.toLocaleString("pt-BR")

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-foreground">{label}</span>
        {hint && <span className="block text-[10px] leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

export function AreaRoutePanel() {
  const {
    activeArea,
    activePoints,
    activeRoute,
    routeSettings,
    updateRouteSettings,
    isPickingOrigin,
    startPickingOrigin,
    cancelPickingOrigin,
    setRouteOrigin,
  } = useAreas()
  const { selectPoint } = useMapPoints()
  const { isLoading: isLoadingRoads, error: roadsError } = useRoadPath(activeRoute, routeSettings.useRoads)

  if (!activeArea) return null

  if (activePoints.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Nenhum cliente nesta área para roteirizar.
      </p>
    )
  }

  const firstStop = activeRoute?.stops[0]
  const isSampledSearch = activeRoute ? activeRoute.startsEvaluated < activeRoute.startsAvailable : false

  const handleExport = () => {
    if (!activeRoute) return

    const rows = [
      ["ordem", "cliente", "cidade", "estado", "lat", "lng", "km_da_parada_anterior", "km_acumulado"].join(","),
      ...activeRoute.stops.map((stop) =>
        [
          stop.order,
          `"${stop.point.name.replace(/"/g, '""')}"`,
          `"${(stop.point.city ?? "").replace(/"/g, '""')}"`,
          `"${(stop.point.state ?? "").replace(/"/g, '""')}"`,
          stop.point.lat,
          stop.point.lng,
          (stop.legDistance / 1000).toFixed(2),
          (stop.cumulativeDistance / 1000).toFixed(2),
        ].join(","),
      ),
    ].join("\n")

    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `rota-${activeArea.name.toLowerCase().replace(/\s+/g, "-")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <Toggle
        checked={routeSettings.enabled}
        onChange={(enabled) => updateRouteSettings({ enabled })}
        label="Calcular rota desta área"
        hint={`${formatNumber(activePoints.length)} cliente(s) na sequência`}
      />

      {routeSettings.enabled && (
        <>
          <div className="space-y-2 rounded-lg border bg-background px-3 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Ponto de partida</p>

            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={routeSettings.origin ? "outline" : "default"}
                className="h-7 flex-1 cursor-pointer px-2 text-[11px]"
                title="O algoritmo testa cada cliente como primeiro e escolhe a sequência mais curta"
                onClick={() => setRouteOrigin(null)}
              >
                <Flag className="mr-1 h-3 w-3" />
                Melhor cliente
              </Button>
              <Button
                size="sm"
                variant={routeSettings.origin ? "default" : "outline"}
                className="h-7 flex-1 cursor-pointer px-2 text-[11px]"
                title="Clique no mapa para marcar a matriz, sua casa ou o hotel"
                onClick={() => (isPickingOrigin ? cancelPickingOrigin() : startPickingOrigin())}
              >
                <Crosshair className="mr-1 h-3 w-3" />
                {isPickingOrigin ? "Clique no mapa" : "Local fixo"}
              </Button>
            </div>

            {isPickingOrigin && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                Clique no mapa para marcar a partida. Esc cancela.
              </p>
            )}

            {routeSettings.origin && !isPickingOrigin && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate tabular-nums">
                  {routeSettings.origin.lat.toFixed(5)}, {routeSettings.origin.lng.toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={() => setRouteOrigin(null)}
                  className="shrink-0 cursor-pointer rounded p-0.5 hover:bg-accent"
                  title="Remover partida fixa"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <Toggle
            checked={routeSettings.roundTrip}
            onChange={(roundTrip) => updateRouteSettings({ roundTrip })}
            label="Voltar ao ponto de partida"
            hint="Fecha o ciclo no fim do dia"
          />

          <Toggle
            checked={routeSettings.useRoads}
            onChange={(useRoads) => updateRouteSettings({ useRoads })}
            label="Traçado por ruas"
            hint="Desenha o caminho real via Directions. A ordem não muda; consome requisições."
          />

          {isLoadingRoads && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Traçando pelas ruas…
            </p>
          )}

          {roadsError && (
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
              <AlertCircle className="mt-px h-3 w-3 shrink-0" />
              {roadsError}
            </p>
          )}

          {activeRoute && firstStop && (
            <>
              {/* A resposta direta: por qual cliente começar. */}
              <div className="rounded-lg border bg-background px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {routeSettings.origin ? "Primeira parada" : "Comece por"}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-foreground" title={firstStop.point.name}>
                  {firstStop.point.name}
                </p>
                {firstStop.point.city && (
                  <p className="text-[10px] text-muted-foreground">{firstStop.point.city}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-background px-3 py-2">
                  <p className="text-[10px] font-medium text-muted-foreground">Distância total</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {formatDistance(activeRoute.totalDistance)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {activeRoute.roundTrip ? "ida e volta, em linha reta" : "em linha reta"}
                  </p>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2">
                  <p className="text-[10px] font-medium text-muted-foreground">Paradas</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {formatNumber(activeRoute.stops.length)}
                  </p>
                  {activeRoute.returnDistance > 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      volta {formatDistance(activeRoute.returnDistance)}
                    </p>
                  )}
                </div>
              </div>

              {isSampledSearch && (
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Área grande: testei {formatNumber(activeRoute.startsEvaluated)} dos{" "}
                  {formatNumber(activeRoute.startsAvailable)} clientes como ponto de partida. A sequência é boa,
                  mas talvez não a melhor possível.
                </p>
              )}

              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Sequência</p>
                <ol className="mt-1.5 space-y-0.5">
                  {activeRoute.stops.map((stop) => (
                    <li key={stop.point.id}>
                      <button
                        type="button"
                        onClick={() => selectPoint(stop.point)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left",
                          "hover:bg-accent/60",
                        )}
                      >
                        <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {stop.order}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={stop.point.name}>
                          {stop.point.name}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {stop.legDistance > 0 ? `+${formatDistance(stop.legDistance)}` : "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              <Button size="sm" variant="outline" className="h-7 w-full cursor-pointer text-[11px]" onClick={handleExport}>
                <Download className="mr-1.5 h-3 w-3" />
                Exportar sequência
              </Button>
            </>
          )}

          {!activeRoute && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <RouteIcon className="h-3 w-3" />
              Calculando a sequência…
            </p>
          )}
        </>
      )}
    </div>
  )
}
