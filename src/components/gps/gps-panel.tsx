"use client"

import {
  AlertCircle,
  Check,
  Crosshair,
  ExternalLink,
  Loader2,
  Navigation,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import { useGps, type EtaSource } from "@/components/gps/gps-provider"
import { useMapPoints } from "@/components/map-points-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToggleField } from "@/components/ui/toggle-field"
import { formatDistance } from "@/lib/geo"
import {
  compassLabel,
  formatAccuracy,
  formatClock,
  formatDuration,
  formatSpeed,
  SERVICE_SECONDS_PER_STOP,
} from "@/lib/gps"
import { cn } from "@/lib/utils"
import type { Point } from "@/types/point"

const formatNumber = (value: number) => value.toLocaleString("pt-BR")

/** Acima disso o fix não é de GPS — vale avisar antes de o vendedor confiar na distância. */
const APPROXIMATE_ACCURACY_M = 500

const ETA_SOURCE_LABELS: Record<EtaSource, string> = {
  traffic: "com trânsito",
  directions: "por ruas",
  estimate: "estimativa",
}

/** Navegação passo a passo fica com o app do Google — aqui só entregamos o destino. */
function navigationUrl(from: { lat: number; lng: number } | null, to: Point): string {
  const destination = `${to.lat},${to.lng}`
  const origin = from ? `&origin=${from.lat},${from.lng}` : ""
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`
}

function ClientRow({
  point,
  order,
  meta,
  onSelect,
  onVisit,
  highlight,
}: {
  point: Point
  order?: number
  meta: string
  onSelect: () => void
  onVisit: () => void
  highlight?: boolean
}) {
  return (
    <li className={cn("flex items-center gap-1 rounded-md pr-0.5", highlight && "bg-accent/60")}>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/60"
      >
        {order !== undefined && (
          <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">{order}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={point.name}>
          {point.name}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{meta}</span>
      </button>
      <button
        type="button"
        onClick={onVisit}
        title="Registrar visita"
        className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Check className="h-3 w-3" />
      </button>
    </li>
  )
}

export function GpsPanel() {
  const {
    isEnabled,
    enable,
    disable,
    isSupported,
    fix,
    error,
    retryLocation,
    scopeLabel,
    nearby,
    route,
    horizonLimited,
    nextStop,
    nextStopDistance,
    eta,
    isEtaLoading,
    etaError,
    remainingSeconds,
    hasArrived,
    doneCount,
    skippedCount,
    pendingCount,
    markVisited,
    skipStop,
    undoVisit,
    resetVisits,
    followMode,
    setFollowMode,
    useTrafficEta,
    setUseTrafficEta,
  } = useGps()
  const { selectPoint } = useMapPoints()

  const [listMode, setListMode] = useState<"sequence" | "nearest">("sequence")
  /** Última visita registrada, para oferecer desfazer sem abrir uma lista de histórico. */
  const [lastResolved, setLastResolved] = useState<{ point: Point; skipped: boolean } | null>(null)

  useEffect(() => {
    if (!isEnabled) setLastResolved(null)
  }, [isEnabled])

  const resolve = (point: Point, skipped: boolean) => {
    if (skipped) skipStop(point.id)
    else markVisited(point.id)
    setLastResolved({ point, skipped })
  }

  if (!isEnabled) {
    return (
      <Button
        size="sm"
        className="absolute bottom-4 right-4 z-10 cursor-pointer shadow-lg"
        onClick={enable}
        disabled={!isSupported}
        title={isSupported ? "Acompanhar sua posição e roteirizar a partir dela" : "Sem geolocalização neste navegador"}
      >
        <Navigation className="mr-1.5 h-3.5 w-3.5" />
        Modo GPS
      </Button>
    )
  }

  const now = Date.now()
  const arrivalAt = eta ? new Date(now + eta.seconds * 1000) : null
  const finishAt = remainingSeconds !== null ? new Date(now + remainingSeconds * 1000) : null

  return (
    <div className="absolute bottom-4 right-4 z-10 flex max-h-[calc(100vh-2rem)] w-[320px] flex-col overflow-hidden rounded-xl border bg-card shadow-lg">
      <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 shrink-0 text-foreground" />
            <h2 className="truncate text-sm font-semibold text-foreground">Modo GPS</h2>
            {fix && (
              <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
                {formatAccuracy(fix.accuracy)}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={scopeLabel}>
            {scopeLabel} · {fix ? formatSpeed(fix.speed) : "buscando sinal…"}
          </p>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 cursor-pointer"
          title="Sair do modo GPS"
          onClick={disable}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2">
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-foreground">
              <AlertCircle className="mt-px h-3 w-3 shrink-0 text-destructive" />
              {error}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-6 w-full cursor-pointer text-[10px]"
              onClick={retryLocation}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Tentar de novo
            </Button>
          </div>
        )}

        {/* Fix de rede (Wi-Fi/IP) posiciona por bairro, não por rua: a sequência sai
            plausível, mas não é de onde o vendedor está exatamente. */}
        {fix && fix.accuracy > APPROXIMATE_ACCURACY_M && (
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
            <AlertCircle className="mt-px h-3 w-3 shrink-0" />
            Posição aproximada ({formatAccuracy(fix.accuracy)}) — provavelmente localização de rede, sem GPS. A
            sequência e a previsão seguem essa precisão, e a chegada precisa ser confirmada no botão.
          </p>
        )}

        {!fix && !error && (
          <p className="flex items-center gap-1.5 py-4 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Obtendo sua localização…
          </p>
        )}

        {fix && pendingCount === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {doneCount + skippedCount > 0
              ? "Todos os clientes desta base foram resolvidos."
              : "Nenhum cliente pendente nesta base. Selecione uma área ou importe o CSV."}
          </p>
        )}

        {fix && nextStop && (
          <>
            {hasArrived && (
              <div className="rounded-lg border border-foreground/20 bg-accent px-3 py-2.5">
                <p className="text-[11px] font-medium text-accent-foreground">
                  Você chegou em {nextStop.point.name}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 flex-1 cursor-pointer px-2 text-[11px]"
                    onClick={() => resolve(nextStop.point, false)}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Registrar visita
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 cursor-pointer px-2 text-[11px]"
                    onClick={() => resolve(nextStop.point, true)}
                  >
                    <SkipForward className="mr-1 h-3 w-3" />
                    Pular
                  </Button>
                </div>
              </div>
            )}

            {/* A resposta que o vendedor precisa dirigindo: para quem ir e quando chega. */}
            <div className="rounded-lg border bg-background px-3 py-2.5">
              <p className="text-[11px] font-medium text-muted-foreground">Próximo cliente</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground" title={nextStop.point.name}>
                {nextStop.point.name}
              </p>
              {(nextStop.point.address ?? nextStop.point.city) && (
                <p className="truncate text-[10px] text-muted-foreground">
                  {nextStop.point.address ?? nextStop.point.city}
                </p>
              )}

              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-none tabular-nums text-foreground">
                    {eta ? formatDuration(eta.seconds) : "—"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {arrivalAt ? `chega ${formatClock(arrivalAt)}` : "calculando"}
                    {eta && ` · ${ETA_SOURCE_LABELS[eta.source]}`}
                    {isEtaLoading && " · atualizando"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {nextStopDistance !== null ? formatDistance(nextStopDistance) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">em linha reta</p>
                </div>
              </div>

              <div className="mt-2.5 flex gap-1.5">
                <Button size="sm" className="h-7 flex-1 cursor-pointer px-2 text-[11px]" asChild>
                  <a
                    href={navigationUrl(fix.position, nextStop.point)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir a navegação passo a passo no Google Maps"
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Navegar
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 cursor-pointer px-2 text-[11px]"
                  title="Marcar como visitado e ir ao próximo"
                  onClick={() => resolve(nextStop.point, false)}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Visitei
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 cursor-pointer px-2 text-[11px]"
                  title="Deixar este cliente de fora da sequência"
                  onClick={() => resolve(nextStop.point, true)}
                >
                  <SkipForward className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {etaError && (
              <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
                <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                {etaError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] font-medium text-muted-foreground">Pendentes</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {formatNumber(pendingCount)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatNumber(doneCount)} visitados
                  {skippedCount > 0 && ` · ${formatNumber(skippedCount)} pulados`}
                </p>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] font-medium text-muted-foreground">Restante</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {remainingSeconds !== null ? formatDuration(remainingSeconds) : "—"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {finishAt ? `termina ${formatClock(finishAt)}` : "—"}
                </p>
              </div>
            </div>

            <p className="text-[10px] leading-snug text-muted-foreground">
              A previsão do dia soma {SERVICE_SECONDS_PER_STOP / 60} min de atendimento por cliente e estima os
              trechos seguintes por distância.
            </p>

            {lastResolved && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">
                  {lastResolved.skipped ? "Pulado" : "Visitado"}: {lastResolved.point.name}
                </span>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer rounded px-1 py-0.5 text-foreground hover:bg-accent"
                  onClick={() => {
                    undoVisit(lastResolved.point.id)
                    setLastResolved(null)
                  }}
                >
                  Desfazer
                </button>
              </div>
            )}

            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={followMode ? "default" : "outline"}
                className="h-7 flex-1 cursor-pointer px-2 text-[11px]"
                title="Manter o mapa centralizado em você"
                onClick={() => setFollowMode(!followMode)}
              >
                <Crosshair className="mr-1 h-3 w-3" />
                {followMode ? "Seguindo" : "Seguir"}
              </Button>
              {doneCount + skippedCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 cursor-pointer px-2 text-[11px]"
                  title="Voltar todos os clientes para a sequência"
                  onClick={() => {
                    resetVisits()
                    setLastResolved(null)
                  }}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reiniciar
                </Button>
              )}
            </div>

            <ToggleField
              checked={useTrafficEta}
              onChange={setUseTrafficEta}
              label="Previsão com trânsito"
              hint="Consulta a Directions a cada 90 s e a cada 120 m andados. Desligado, usa estimativa própria."
            />

            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setListMode("sequence")}
                    className={cn(
                      "cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium",
                      listMode === "sequence" ? "bg-accent text-foreground" : "text-muted-foreground",
                    )}
                  >
                    Sequência
                  </button>
                  <button
                    type="button"
                    onClick={() => setListMode("nearest")}
                    className={cn(
                      "cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium",
                      listMode === "nearest" ? "bg-accent text-foreground" : "text-muted-foreground",
                    )}
                  >
                    Mais próximos
                  </button>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {listMode === "sequence"
                    ? `${formatNumber(route?.stops.length ?? 0)} paradas`
                    : `${formatNumber(nearby.length)} de ${formatNumber(pendingCount)}`}
                </span>
              </div>

              <ol className="mt-1.5 space-y-0.5">
                {listMode === "sequence"
                  ? route?.stops.map((stop) => (
                      <ClientRow
                        key={stop.point.id}
                        point={stop.point}
                        order={stop.order}
                        highlight={stop.order === 1}
                        meta={
                          stop.order === 1 && nextStopDistance !== null
                            ? formatDistance(nextStopDistance)
                            : `+${formatDistance(stop.legDistance)}`
                        }
                        onSelect={() => selectPoint(stop.point)}
                        onVisit={() => resolve(stop.point, false)}
                      />
                    ))
                  : nearby.map((item) => (
                      <ClientRow
                        key={item.point.id}
                        point={item.point}
                        meta={`${formatDistance(item.distance)} ${compassLabel(item.bearing)}`}
                        onSelect={() => selectPoint(item.point)}
                        onVisit={() => resolve(item.point, false)}
                      />
                    ))}
              </ol>

              {listMode === "sequence" && horizonLimited && (
                <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                  Sequência calculada sobre os {formatNumber(route?.stops.length ?? 0)} clientes mais próximos dos{" "}
                  {formatNumber(pendingCount)} pendentes — o suficiente para o dia, e mantém o recálculo instantâneo.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
