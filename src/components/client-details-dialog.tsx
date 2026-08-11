"use client"

import { Check, Copy, ExternalLink, Loader2, MapPin, Navigation, Route } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { useMapPoints } from "@/components/map-points-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { mergeLocation } from "@/hooks/use-location-resolver"
import { getStateName } from "@/lib/br-states"
import { reverseGeocodePoints } from "@/lib/reverse-geocode"
import type { Point } from "@/types/point"

interface ClientDetailsDialogProps {
  point: Point | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function googleMapsUrl(point: Point) {
  const query = `${point.lat},${point.lng}`
  const placeId = point.placeId ? `&query_place_id=${encodeURIComponent(point.placeId)}` : ""
  return `https://www.google.com/maps/search/?api=1&query=${query}${placeId}`
}

function directionsUrl(point: Point) {
  const destination = `${point.lat},${point.lng}`
  const placeId = point.placeId ? `&destination_place_id=${encodeURIComponent(point.placeId)}` : ""
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${placeId}`
}

function streetViewUrl(point: Point) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lng}`
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null

  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{value}</span>
    </div>
  )
}

export function ClientDetailsDialog({ point, open, onOpenChange }: ClientDetailsDialogProps) {
  const { updateManyPoints } = useMapPoints()
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const needsAddress = Boolean(point && !point.address)

  // Busca o endereço só quando o modal abre para um cliente que ainda não tem —
  // uma chamada por cliente, e o resultado fica em cache.
  useEffect(() => {
    if (!open || !point || !needsAddress) return

    let cancelled = false
    setIsLoadingAddress(true)
    setAddressError(null)

    reverseGeocodePoints([{ id: point.id, lat: point.lat, lng: point.lng }])
      .then(async (resolved) => {
        const location = resolved.get(point.id)
        if (cancelled || !location) return

        const data = mergeLocation(point, location)
        if (data) await updateManyPoints([{ id: point.id, data }])
      })
      .catch((error) => {
        if (!cancelled) {
          setAddressError(error instanceof Error ? error.message : "Não foi possível buscar o endereço")
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAddress(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, point, needsAddress, updateManyPoints])

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  const handleCopyCoordinates = useCallback(async () => {
    if (!point) return

    try {
      await navigator.clipboard.writeText(`${point.lat}, ${point.lng}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sem permissão de clipboard: o valor segue visível para cópia manual.
    }
  }, [point])

  if (!point) return null

  const cityLine = [point.city, point.state].filter(Boolean).join(" - ")
  const stateLine = point.state ? getStateName(point.state) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">{point.name}</DialogTitle>
          {point.description && <DialogDescription>{point.description}</DialogDescription>}
        </DialogHeader>

        {point.category && (
          <div>
            <Badge variant="secondary">{point.category}</Badge>
          </div>
        )}

        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              {isLoadingAddress && !point.address ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Buscando endereço...
                </p>
              ) : point.address ? (
                <p className="text-sm text-foreground">{point.address}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{addressError ?? "Endereço não identificado"}</p>
              )}
              {(point.neighborhood || cityLine) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[point.neighborhood, cityLine].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="divide-y">
          <InfoRow label="Cidade" value={point.city} />
          <InfoRow label="Estado" value={stateLine} />
          <InfoRow label="Bairro" value={point.neighborhood} />
          <InfoRow label="CEP" value={point.postalCode} />
          <div className="flex items-baseline justify-between gap-4 py-1.5">
            <span className="shrink-0 text-xs text-muted-foreground">Coordenadas</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm tabular-nums text-foreground">
                {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 cursor-pointer"
                onClick={handleCopyCoordinates}
                title="Copiar coordenadas"
                aria-label="Copiar coordenadas"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* flex-wrap evita que a linha de botões estoure a largura do modal. */}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-start">
          <Button asChild variant="default" size="sm" className="cursor-pointer">
            <a href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir no Google Maps
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="cursor-pointer">
            <a href={directionsUrl(point)} target="_blank" rel="noopener noreferrer">
              <Route className="mr-2 h-4 w-4" />
              Como chegar
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="cursor-pointer">
            <a href={streetViewUrl(point)} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-2 h-4 w-4" />
              Street View
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
