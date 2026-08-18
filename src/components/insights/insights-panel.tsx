"use client"

import { AlertCircle, Download, MapPin, RefreshCw, Search, X } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { useMapPoints } from "@/components/map-points-provider"
import { StatTile } from "@/components/insights/stat-tile"
import { RankingChart } from "@/components/insights/ranking-chart"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useLocationResolver } from "@/hooks/use-location-resolver"
import { getStateName, normalizeText, toStateCode } from "@/lib/br-states"
import { pointsUseCase } from "@/usecases/points-usecase"

const CITY_LIMIT = 10
const formatNumber = (value: number) => value.toLocaleString("pt-BR")

export function InsightsPanel() {
  const { points, exportToCSV } = useMapPoints()
  const { isResolving, done, total, error, pendingCount, resolve, reprocess, cancel } = useLocationResolver()

  const [search, setSearch] = useState("")
  const [stateFilter, setStateFilter] = useState<string | null>(null)

  const scopedPoints = useMemo(() => {
    const term = normalizeText(search)

    return points.filter((point) => {
      const uf = toStateCode(point.state)

      if (stateFilter && uf !== stateFilter) return false
      if (!term) return true

      const haystack = [point.name, point.city, uf, uf ? getStateName(uf) : null]
        .filter(Boolean)
        .map((value) => normalizeText(String(value)))

      return haystack.some((value) => value.includes(term))
    })
  }, [points, search, stateFilter])

  const insights = useMemo(() => pointsUseCase.buildLocationInsights(scopedPoints), [scopedPoints])

  const availableStates = useMemo(() => pointsUseCase.buildLocationInsights(points).states, [points])

  const topState = insights.states[0] ?? null
  const topCity = insights.cities[0] ?? null
  const isFiltered = Boolean(stateFilter) || search.trim().length > 0
  const coverage = insights.total > 0 ? (insights.located / insights.total) * 100 : 0

  const handleExport = () => {
    const csv = exportToCSV(scopedPoints)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = stateFilter ? `clientes-${stateFilter.toLowerCase()}.csv` : "clientes.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  if (points.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <MapPin className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Nenhum cliente importado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Importe um CSV no mapa para ver a distribuição de clientes por estado e cidade.
        </p>
        <Button asChild size="sm" className="mt-2">
          <Link href="/">Ir para o mapa</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <SidebarTrigger className="-ml-1.5 size-9 shrink-0 cursor-pointer md:hidden" title="Abrir menu" />
              <h1 className="text-xl font-semibold text-foreground">Insights de clientes</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Distribuição geográfica da base importada — por estado e por cidade.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="cursor-pointer">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </header>

        {isResolving && (
          <div className="rounded-xl border bg-card px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-foreground">
                Identificando cidade e estado dos clientes… {formatNumber(done)} de {formatNumber(total)}
              </p>
              <Button variant="ghost" size="sm" onClick={cancel} className="cursor-pointer">
                Cancelar
              </Button>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${total > 0 ? (done / total) * 100 : 0}%`,
                  backgroundColor: "var(--viz-series-1)",
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!isResolving && pendingCount > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                {formatNumber(pendingCount)} cliente(s) ainda sem cidade/estado identificados.
              </span>
              <Button variant="outline" size="sm" onClick={() => resolve()} className="cursor-pointer">
                Identificar agora
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por cliente, cidade ou estado..."
              className="pl-8"
            />
          </div>

          <select
            value={stateFilter ?? ""}
            onChange={(event) => setStateFilter(event.target.value || null)}
            className="h-9 cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">Todos os estados</option>
            {availableStates.map((state) => (
              <option key={state.key} value={state.key}>
                {state.label} ({formatNumber(state.count)})
              </option>
            ))}
          </select>

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("")
                setStateFilter(null)
              }}
              className="cursor-pointer"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={reprocess}
            disabled={isResolving}
            className="cursor-pointer"
            title="Descarta o cache e refaz a identificação de cidade/estado"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Reprocessar
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            hero
            label={isFiltered ? "Clientes no filtro" : "Total de clientes"}
            value={formatNumber(insights.total)}
            hint={isFiltered ? `de ${formatNumber(points.length)} na base completa` : undefined}
          />
          <StatTile
            label="Estados atendidos"
            value={formatNumber(insights.states.length)}
            hint={topState ? `Maior: ${topState.label} (${formatNumber(topState.count)})` : undefined}
          />
          <StatTile
            label="Cidades atendidas"
            value={formatNumber(insights.cities.length)}
            hint={topCity ? `Maior: ${topCity.label} (${formatNumber(topCity.count)})` : undefined}
          />
          <StatTile
            label="Cobertura identificada"
            value={`${coverage.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
            hint={
              insights.unlocated > 0
                ? `${formatNumber(insights.unlocated)} sem localização`
                : "Todos os clientes localizados"
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RankingChart
            title="Clientes por estado"
            description="Clique em um estado para filtrar o painel"
            data={insights.states}
            selectedKey={stateFilter}
            onSelect={(stat) => setStateFilter(stat?.key ?? null)}
            emptyMessage="Nenhum estado identificado ainda"
          />

          <RankingChart
            title="Clientes por cidade"
            description={
              insights.cities.length > CITY_LIMIT
                ? `Top ${CITY_LIMIT} de ${formatNumber(insights.cities.length)} cidades`
                : undefined
            }
            data={insights.cities}
            limit={CITY_LIMIT}
            emptyMessage="Nenhuma cidade identificada ainda"
          />
        </div>

        {insights.regions.length > 0 && (
          <RankingChart
            title="Clientes por região"
            data={insights.regions}
            emptyMessage="Nenhuma região identificada ainda"
          />
        )}
      </div>
    </div>
  )
}
