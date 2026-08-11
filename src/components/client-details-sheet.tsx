/* eslint-disable @next/next/no-img-element */
"use client"

import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Route,
  Star,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { useMapPoints } from "@/components/map-points-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { mergeLocation } from "@/hooks/use-location-resolver"
import { getStateName, normalizeText } from "@/lib/br-states"
import { fetchPlaceDetails, type PlaceDetails } from "@/lib/places"
import { reverseGeocodePoints } from "@/lib/reverse-geocode"
import { cn } from "@/lib/utils"
import type { Point } from "@/types/point"

interface ClientDetailsSheetProps {
  point: Point | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Palavras que não ajudam a identificar o cliente nas iniciais do avatar. */
const FILLER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "ltda", "me", "epp", "sa"])

const AVATAR_TINTS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
]

function getInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !FILLER_WORDS.has(word.toLowerCase()))

  const initials = words.slice(0, 2).map((word) => word[0])
  return (initials.join("") || name.slice(0, 2)).toUpperCase()
}

function getTint(name: string): string {
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}

function googleMapsUrl(point: Point, place: PlaceDetails | null) {
  if (place?.googleMapsUri) return place.googleMapsUri

  const placeId = place?.placeId ?? point.placeId
  const query = `${point.lat},${point.lng}`
  return `https://www.google.com/maps/search/?api=1&query=${query}${
    placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ""
  }`
}

function directionsUrl(point: Point, place: PlaceDetails | null) {
  const placeId = place?.placeId ?? point.placeId
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}${
    placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : ""
  }`
}

function streetViewUrl(point: Point) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lng}`
}

/** Estrelas com preenchimento proporcional — 4,5 não pode aparecer como 5 cheias. */
function RatingStars({ rating }: { rating: number }) {
  const stars = [1, 2, 3, 4, 5]

  return (
    <span className="relative inline-flex" aria-hidden>
      <span className="flex items-center gap-0.5">
        {stars.map((position) => (
          <Star key={position} className="h-3.5 w-3.5 fill-muted text-muted" />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 flex items-center gap-0.5 overflow-hidden"
        style={{ width: `${(Math.min(Math.max(rating, 0), 5) / 5) * 100}%` }}
      >
        {stars.map((position) => (
          <Star key={position} className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
        ))}
      </span>
    </span>
  )
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm text-foreground">{children}</div>
      </div>
    </div>
  )
}

export function ClientDetailsSheet({ point, open, onOpenChange }: ClientDetailsSheetProps) {
  const { updateManyPoints } = useMapPoints()
  const [place, setPlace] = useState<PlaceDetails | null>(null)
  const [isLoadingPlace, setIsLoadingPlace] = useState(false)
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)
  const [copied, setCopied] = useState(false)

  const pointId = point?.id ?? null
  const needsAddress = Boolean(point && !point.address)

  // Endereço: uma chamada de geocodificação reversa por cliente, cacheada.
  useEffect(() => {
    if (!open || !point || !needsAddress) return

    let cancelled = false
    setIsLoadingAddress(true)

    reverseGeocodePoints([{ id: point.id, lat: point.lat, lng: point.lng }])
      .then(async (resolved) => {
        const location = resolved.get(point.id)
        if (cancelled || !location) return

        const data = mergeLocation(point, location)
        if (data) await updateManyPoints([{ id: point.id, data }])
      })
      .catch((error) => console.warn("Falha ao buscar endereço", error))
      .finally(() => {
        if (!cancelled) setIsLoadingAddress(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, point, needsAddress, updateManyPoints])

  // Ficha do Google (foto, avaliação, horário). Se a Places API não estiver
  // habilitada para a chave, a seção simplesmente não aparece.
  useEffect(() => {
    if (!open || !point) return

    let cancelled = false
    setPlace(null)
    setIsLoadingPlace(true)

    fetchPlaceDetails({ name: point.name, lat: point.lat, lng: point.lng })
      .then((details) => {
        if (!cancelled) setPlace(details)
      })
      .catch((error) => console.warn("Falha ao buscar dados do Google Places", error))
      .finally(() => {
        if (!cancelled) setIsLoadingPlace(false)
      })

    return () => {
      cancelled = true
    }
    // Só refaz a busca ao trocar de cliente, não a cada atualização do ponto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pointId])

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
      // Sem permissão de clipboard: o valor continua visível para cópia manual.
    }
  }, [point])

  if (!point) return null

  const cityLine = [point.city, point.state].filter(Boolean).join(" - ")
  const hasPlaceInfo = Boolean(place && !place.notFound)
  const isClosedDown = place?.businessStatus && place.businessStatus !== "OPERATIONAL"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-md [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-background/85 [&>button]:p-1.5 [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:backdrop-blur"
      >
        <SheetDescription className="sr-only">Detalhes do cliente {point.name}</SheetDescription>

        <div className="relative h-36 shrink-0 overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900">
          {isLoadingPlace && <Skeleton className="h-full w-full" />}
          {place?.photoUrl && (
            <img src={place.photoUrl} alt={`Foto de ${point.name}`} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
        </div>

        <div className="-mt-9 px-5">
          <Avatar className={cn("size-16 ring-4 ring-background", getTint(point.name))}>
            <AvatarFallback className={cn("text-lg font-semibold", getTint(point.name))}>
              {getInitials(point.name)}
            </AvatarFallback>
          </Avatar>

          <SheetTitle className="mt-3 text-lg leading-snug">{point.name}</SheetTitle>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {point.category && <Badge variant="secondary">{point.category}</Badge>}
            {place?.openNow === true && (
              <Badge className="border-transparent bg-emerald-100 text-emerald-700">Aberto agora</Badge>
            )}
            {place?.openNow === false && <Badge variant="outline">Fechado agora</Badge>}
            {isClosedDown && <Badge variant="destructive">Fechado permanentemente</Badge>}
          </div>

          {place?.rating !== undefined && (
            <div className="mt-3 flex items-center gap-2">
              <RatingStars rating={place.rating} />
              <span className="text-sm font-medium text-foreground">
                {place.rating.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              {place.ratingCount !== undefined && (
                <span className="text-xs text-muted-foreground">
                  ({place.ratingCount.toLocaleString("pt-BR")} avaliações no Google)
                </span>
              )}
            </div>
          )}

          {point.description && <p className="mt-3 text-sm text-muted-foreground">{point.description}</p>}

          {/* O match é por nome + proximidade, então mostramos qual ficha o Google devolveu. */}
          {place?.displayName && normalizeText(place.displayName) !== normalizeText(point.name) && (
            <p className="mt-2 text-xs text-muted-foreground">Ficha do Google: {place.displayName}</p>
          )}
        </div>

        <div className="mt-5 flex-1 space-y-4 overflow-y-auto border-t px-5 py-4">
          <DetailRow icon={<MapPin className="h-4 w-4" />} label="Endereço">
            {isLoadingAddress && !point.address ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando...
              </span>
            ) : (
              <>
                <p>{point.address ?? place?.formattedAddress ?? "Não identificado"}</p>
                {(point.neighborhood || cityLine) && (
                  <p className="text-xs text-muted-foreground">
                    {[point.neighborhood, cityLine].filter(Boolean).join(" · ")}
                    {point.postalCode ? ` · ${point.postalCode}` : ""}
                  </p>
                )}
                {point.state && (
                  <p className="text-xs text-muted-foreground">{getStateName(point.state)}</p>
                )}
              </>
            )}
          </DetailRow>

          {place?.phone && (
            <DetailRow icon={<Phone className="h-4 w-4" />} label="Telefone">
              <a href={`tel:${place.phone.replace(/\s/g, "")}`} className="hover:underline">
                {place.phone}
              </a>
            </DetailRow>
          )}

          {place?.website && (
            <DetailRow icon={<Globe className="h-4 w-4" />} label="Site">
              <a
                href={place.website}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate hover:underline"
              >
                {place.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </DetailRow>
          )}

          {place?.weekdayHours && place.weekdayHours.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-3 text-left">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Horário de funcionamento</p>
                  <p className="text-sm text-foreground">Ver semana completa</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1 pl-7">
                {place.weekdayHours.map((line) => (
                  <p key={line} className="text-xs text-muted-foreground">
                    {line}
                  </p>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <DetailRow icon={<Navigation className="h-4 w-4" />} label="Coordenadas">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm tabular-nums">
                {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 cursor-pointer"
                onClick={handleCopyCoordinates}
                aria-label="Copiar coordenadas"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </DetailRow>

          {!isLoadingPlace && !hasPlaceInfo && (
            <p className="text-xs text-muted-foreground">
              Sem ficha correspondente no Google para este cliente.
            </p>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t bg-background p-4">
          <Button asChild className="w-full cursor-pointer">
            <a href={googleMapsUrl(point, place)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir no Google Maps
            </a>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="cursor-pointer">
              <a href={directionsUrl(point, place)} target="_blank" rel="noopener noreferrer">
                <Route className="mr-2 h-4 w-4" />
                Como chegar
              </a>
            </Button>
            <Button asChild variant="outline" className="cursor-pointer">
              <a href={streetViewUrl(point)} target="_blank" rel="noopener noreferrer">
                <Navigation className="mr-2 h-4 w-4" />
                Street View
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
