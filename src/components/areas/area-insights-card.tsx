"use client"

import { Check, Download, Pencil, Trash2, X } from "lucide-react"
import { useEffect, useState } from "react"

import { AreaAppearance } from "@/components/areas/area-appearance"
import { AreaRoutePanel } from "@/components/areas/area-route-panel"
import { useAreas } from "@/components/areas/areas-provider"
import { useMapPoints } from "@/components/map-points-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatAreaKm2, formatDistance } from "@/lib/geo"
import { AREA_KIND_LABELS } from "@/types/area"
import type { LocationStat } from "@/usecases/points-usecase"

const formatNumber = (value: number) => value.toLocaleString("pt-BR")
const formatPercentage = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function MiniRanking({ title, data, limit = 3 }: { title: string; data: LocationStat[]; limit?: number }) {
  if (data.length === 0) return null

  const visible = data.slice(0, limit)
  const max = Math.max(...data.map((item) => item.count))

  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {visible.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            <span className="w-[42%] shrink-0 truncate text-xs text-foreground" title={item.label}>
              {item.label}
            </span>
            <span
              className="h-2.5 rounded-r-[3px]"
              style={{
                width: `${max > 0 ? Math.max((item.count / max) * 100, 3) : 0}%`,
                backgroundColor: "var(--viz-series-1)",
              }}
              aria-hidden
            />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatNumber(item.count)}</span>
          </li>
        ))}
        {data.length > limit && (
          <li className="text-[11px] text-muted-foreground">+{data.length - limit} outras</li>
        )}
      </ul>
    </div>
  )
}

export function AreaInsightsCard() {
  const { activeArea, activeInsights, activePoints, renameArea, removeArea, selectArea, updateStyle } = useAreas()
  const { exportToCSV } = useMapPoints()

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")

  // Trocar de área cancela uma renomeação em andamento.
  useEffect(() => {
    setIsEditingName(false)
  }, [activeArea?.id])

  if (!activeArea || !activeInsights) return null

  const { location } = activeInsights

  const handleExport = () => {
    const csv = exportToCSV(activePoints)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${activeArea.name.toLowerCase().replace(/\s+/g, "-")}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const commitName = () => {
    renameArea(activeArea.id, nameDraft)
    setIsEditingName(false)
  }

  return (
    <div className="w-[320px] overflow-hidden rounded-xl border bg-card shadow-lg">
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitName()
                  if (event.key === "Escape") setIsEditingName(false)
                }}
                className="h-7 text-sm"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 cursor-pointer" onClick={commitName}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold text-foreground" title={activeArea.name}>
                {activeArea.name}
              </h2>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {AREA_KIND_LABELS[activeArea.kind]}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 cursor-pointer"
                title="Renomear área"
                onClick={() => {
                  setNameDraft(activeArea.name)
                  setIsEditingName(true)
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {activeArea.kind === "circle"
              ? `Raio de ${formatDistance(activeArea.radius)}`
              : `${activeArea.path.length} vértices`}{" "}
            · arraste no mapa para ajustar
          </p>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 cursor-pointer"
          title="Fechar painel"
          onClick={() => selectArea(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      <Tabs defaultValue="insights">
        <TabsList className="mx-4 mt-3 grid w-[calc(100%-2rem)] grid-cols-2">
          <TabsTrigger value="insights" className="cursor-pointer text-[11px]">
            Insights
          </TabsTrigger>
          <TabsTrigger value="rota" className="cursor-pointer text-[11px]">
            Rota
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rota" className="max-h-[calc(100vh-22rem)] overflow-y-auto px-4 py-3">
          <AreaRoutePanel />
        </TabsContent>

        <TabsContent
          value="insights"
          className="max-h-[calc(100vh-22rem)] space-y-4 overflow-y-auto px-4 py-3"
        >
          <AreaAppearance area={activeArea} onChange={(style) => updateStyle(activeArea.id, style)} />

          <div className="rounded-lg border bg-background px-3 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">Clientes na área</p>
            <p className="mt-0.5 text-4xl font-semibold leading-none tabular-nums text-foreground">
              {formatNumber(activeInsights.total)}
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {formatPercentage(activeInsights.shareOfBase)} da base completa
            </p>
          </div>

          {activeInsights.total === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhum cliente nesta área. Arraste as bordas no mapa para ampliá-la.
            </p>
          ) : (
            <>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Extensão" value={formatAreaKm2(activeInsights.sizeKm2)} />
              <Metric
                label="Densidade"
                value={`${activeInsights.density.toLocaleString("pt-BR", { maximumFractionDigits: activeInsights.density < 10 ? 2 : 0 })}`}
                hint="clientes / km²"
              />
              <Metric
                label="Distância média"
                value={formatDistance(activeInsights.avgDistanceFromCenter)}
                hint="até o centro"
              />
              {activeInsights.spread > 0 ? (
                <Metric
                  label="Amplitude"
                  value={formatDistance(activeInsights.spread)}
                  hint="entre os 2 mais distantes"
                />
              ) : (
                activeInsights.farthest && (
                  <Metric
                    label="Mais distante"
                    value={formatDistance(activeInsights.farthest.distance)}
                    hint={activeInsights.farthest.point.name}
                  />
                )
              )}
            </div>

            <MiniRanking title="Cidades" data={location.cities} />
            <MiniRanking title="Estados" data={location.states} />
            <MiniRanking title="Categorias" data={activeInsights.categories} />

              {location.unlocated > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {formatNumber(location.unlocated)} cliente(s) sem cidade/estado identificados — rode a
                  identificação no painel de insights para completar os rankings.
                </p>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <footer className="flex items-center gap-2 border-t px-4 py-2.5">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 cursor-pointer"
          disabled={activeInsights.total === 0}
          onClick={handleExport}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Exportar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="cursor-pointer text-destructive hover:text-destructive"
          title="Excluir área"
          onClick={() => removeArea(activeArea.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </footer>
    </div>
  )
}
