"use client"

import { Table2, BarChart3 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { LocationStat } from "@/usecases/points-usecase"

interface RankingChartProps {
  title: string
  description?: string
  data: LocationStat[]
  limit?: number
  emptyMessage?: string
  selectedKey?: string | null
  onSelect?: (stat: LocationStat | null) => void
  unitLabel?: string
}

const formatNumber = (value: number) => value.toLocaleString("pt-BR")
const formatPercentage = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`

export function RankingChart({
  title,
  description,
  data,
  limit,
  emptyMessage = "Sem dados para exibir",
  selectedKey = null,
  onSelect,
  unitLabel = "clientes",
}: RankingChartProps) {
  const [showTable, setShowTable] = useState(false)

  const visible = limit ? data.slice(0, limit) : data
  const tail = limit ? data.slice(limit) : []
  const tailCount = tail.reduce((sum, item) => sum + item.count, 0)
  const maxCount = data.length > 0 ? Math.max(...data.map((item) => item.count)) : 0

  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 cursor-pointer text-xs"
          onClick={() => setShowTable((prev) => !prev)}
          aria-pressed={showTable}
        >
          {showTable ? <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> : <Table2 className="mr-1.5 h-3.5 w-3.5" />}
          {showTable ? "Ver gráfico" : "Ver tabela"}
        </Button>
      </header>

      <div className="px-5 py-4">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : showTable ? (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">#</th>
                  <th className="py-2 font-medium">Local</th>
                  <th className="py-2 text-right font-medium">Clientes</th>
                  <th className="py-2 text-right font-medium">Participação</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, index) => (
                  <tr key={item.key} className="border-b last:border-0">
                    <td className="py-2 text-xs tabular-nums text-muted-foreground">{index + 1}</td>
                    <td className="py-2">
                      <span className="text-foreground">{item.label}</span>
                      {item.sublabel && <span className="ml-1.5 text-xs text-muted-foreground">{item.sublabel}</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">{formatNumber(item.count)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {formatPercentage(item.percentage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
            {visible.map((item) => {
              const isSelected = selectedKey === item.key
              const width = maxCount > 0 ? Math.max((item.count / maxCount) * 100, 1.5) : 0

              return (
                <li key={item.key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelect?.(isSelected ? null : item)}
                        disabled={!onSelect}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md py-1.5 text-left transition-colors",
                          onSelect && "cursor-pointer hover:bg-accent/60 focus-visible:outline-2",
                          isSelected && "bg-accent",
                        )}
                      >
                        <span className="w-[38%] shrink-0 truncate text-xs text-foreground" title={item.label}>
                          {item.label}
                          {item.sublabel && item.sublabel !== item.label && (
                            <span className="ml-1 text-muted-foreground">{item.sublabel}</span>
                          )}
                        </span>

                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className="h-3 rounded-r-[4px]"
                            style={{ width: `${width}%`, backgroundColor: "var(--viz-series-1)" }}
                            aria-hidden
                          />
                          <span className="shrink-0 text-xs tabular-nums text-foreground">
                            {formatNumber(item.count)}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatPercentage(item.percentage)}
                          </span>
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {item.label}
                      {item.sublabel ? ` (${item.sublabel})` : ""} · {formatNumber(item.count)} {unitLabel} ·{" "}
                      {formatPercentage(item.percentage)} da base
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            })}

            {tail.length > 0 && (
              <li className="flex w-full items-center gap-3 py-1.5">
                <span className="w-[38%] shrink-0 truncate text-xs text-muted-foreground">
                  Outras {tail.length} {tail.length === 1 ? "localidade" : "localidades"}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="h-3 rounded-r-[4px]"
                    style={{
                      width: `${maxCount > 0 ? Math.max((tailCount / maxCount) * 100, 1.5) : 0}%`,
                      backgroundColor: "var(--viz-muted-mark)",
                    }}
                    aria-hidden
                  />
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatNumber(tailCount)}</span>
                </span>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  )
}
