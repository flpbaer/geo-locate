/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { GoogleMap, Marker } from "@react-google-maps/api"
import { useMapPoints } from "@/components/map-points-provider"
import { AreaOverlays } from "@/components/areas/area-overlays"
import { useAreas } from "@/components/areas/areas-provider"
import { ClientDetailsSheet } from "@/components/client-details-sheet"
import { areaBounds } from "@/lib/geo"
import type { Point } from "@/types/point"

export const defaultMapContainerStyle = {
  width: "100%",
  height: "100vh",
  borderRadius: "4px",
}

const defaultMapCenter = {
  lat: -26.888244,
  lng: -49.081448,
}

declare global {
  interface Window {
    google: any
  }
}
const OptimizedMarker = React.memo(
  ({
    point,
    onClick,
    icon,
  }: {
    point: Point
    onClick: (point: Point) => void
    icon: any
    isSelected: boolean
  }) => {
    const handleClick = useCallback(() => {
      onClick(point)
    }, [point, onClick])

    return <Marker position={{ lat: point.lat, lng: point.lng }} onClick={handleClick} icon={icon} />
  },
)

OptimizedMarker.displayName = "OptimizedMarker"
const MapComponent = () => {
  const { points: importedPoints, selectedPoint, selectPoint } = useMapPoints()
  const { activeArea, activePoints, activeRoute } = useAreas()
  const [detailsPointId, setDetailsPointId] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState(defaultMapCenter)
  const [mapZoom, setMapZoom] = useState(5)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [hasInitializedView, setHasInitializedView] = useState(false)

  // Derivado da lista viva: o endereço buscado dentro do modal precisa aparecer nele.
  const detailsPoint = useMemo(
    () => importedPoints.find((point) => point.id === detailsPointId) ?? null,
    [importedPoints, detailsPointId],
  )

  const markerIcons = useMemo(() => {
    if (typeof window === "undefined" || !window.google) return { default: null, selected: null, muted: null }

    const defaultIcon = {
      url:
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(`
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#3B82F6"/>
            <circle cx="12" cy="9" r="2.5" fill="white"/>
          </svg>
        `),
      scaledSize: new window.google.maps.Size(24, 24),
      anchor: new window.google.maps.Point(12, 24),
    }

    const selectedIcon = {
      url:
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(`
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EF4444"/>
            <circle cx="12" cy="9" r="2.5" fill="white"/>
            <circle cx="12" cy="9" r="1" fill="#EF4444"/>
          </svg>
        `),
      scaledSize: new window.google.maps.Size(32, 32),
      anchor: new window.google.maps.Point(16, 32),
    }

    // Usado nos clientes de fora da área ativa, para que os de dentro se destaquem.
    const mutedIcon = {
      url:
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(`
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#94A3B8" fill-opacity="0.55"/>
          </svg>
        `),
      scaledSize: new window.google.maps.Size(18, 18),
      anchor: new window.google.maps.Point(9, 18),
    }

    return { default: defaultIcon, selected: selectedIcon, muted: mutedIcon }
  }, [])

  const activePointIds = useMemo(() => new Set(activePoints.map((point) => point.id)), [activePoints])

  // Paradas da rota já são desenhadas numeradas pelo RouteOverlay — o pino padrão
  // delas ficaria empilhado por baixo.
  const routeStopIds = useMemo(
    () => new Set(activeRoute?.stops.map((stop) => stop.point.id) ?? []),
    [activeRoute],
  )

  const adjustInitialMapView = useCallback(() => {
    if (importedPoints.length === 0 || hasInitializedView) return

    if (importedPoints.length === 1) {
      setMapZoom(12)
      setHasInitializedView(true)
      return
    }

    if (typeof window === "undefined" || !window.google) return
    const bounds = new window.google.maps.LatLngBounds()
    importedPoints.forEach((point) => {
      bounds.extend({ lat: point.lat, lng: point.lng })
    })
    const center = bounds.getCenter()
    setMapCenter({ lat: center.lat(), lng: center.lng() })
    const ne = bounds.getNorthEast()
    const sw = bounds.getSouthWest()
    const distance = window.google.maps.geometry.spherical.computeDistanceBetween(ne, sw)
    let zoom = 10
    if (distance < 1000) zoom = 15
    else if (distance < 5000) zoom = 13
    else if (distance < 20000) zoom = 11
    else if (distance < 100000) zoom = 9
    else zoom = 7
    setMapZoom(zoom)
    setHasInitializedView(true)
  }, [importedPoints, hasInitializedView])

  const centerMapOnPoint = useCallback(
    (point: Point) => {
      const newCenter = { lat: point.lat, lng: point.lng }

      if (map) {
        map.panTo(newCenter)
        if (map.getZoom()! < 10) {
          map.setZoom(12)
        }
      } else {
        setMapCenter(newCenter)
        if (mapZoom < 10) {
          setMapZoom(12)
        }
      }
    },
    [map, mapZoom],
  )

  // Selecionar pela sidebar centraliza o mapa e abre o painel do cliente.
  useEffect(() => {
    if (!selectedPoint) return
    centerMapOnPoint(selectedPoint)
    setDetailsPointId(selectedPoint.id)
  }, [selectedPoint, centerMapOnPoint])

  useEffect(() => {
    if (importedPoints.length > 0 && !hasInitializedView) {
      adjustInitialMapView()
    }
  }, [importedPoints, adjustInitialMapView, hasInitializedView])

  useEffect(() => {
    if (importedPoints.length === 0) {
      setHasInitializedView(false)
    }
  }, [importedPoints.length])

  // Selecionar uma área enquadra o mapa nela. Depende só do id: ajustar a forma
  // arrastando as bordas não deve reenquadrar o mapa no meio da interação.
  useEffect(() => {
    if (!map || !activeArea) return
    map.fitBounds(areaBounds(activeArea), 64)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activeArea?.id])

  const handleMarkerClick = useCallback(
    (point: Point) => {
      selectPoint(point)
      setDetailsPointId(point.id)
    },
    [selectPoint],
  )

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance)
  }, [])

  const handleMapChange = useCallback(() => {
    if (map) {
      const center = map.getCenter()
      const zoom = map.getZoom()
      if (center && zoom) {
        setMapCenter({ lat: center.lat(), lng: center.lng() })
        setMapZoom(zoom)
      }
    }
  }, [map])

  return (
    <div className="w-full h-full">
      <GoogleMap
        mapContainerStyle={defaultMapContainerStyle}
        center={mapCenter}
        zoom={mapZoom}
        onLoad={onMapLoad}
        onDragEnd={handleMapChange}
        onZoomChanged={handleMapChange}
        options={{
          zoomControl: true,
          mapTypeControl: true,
        disableDefaultUI: true
        }}
      >
        <AreaOverlays />

        {importedPoints.map((point) => {
          if (routeStopIds.has(point.id)) return null

          const isSelected = selectedPoint?.id === point.id
          const isOutsideActiveArea = activeArea !== null && !activePointIds.has(point.id)
          const icon = isSelected
            ? markerIcons.selected
            : isOutsideActiveArea
              ? markerIcons.muted
              : markerIcons.default

          return (
            <OptimizedMarker
              key={point.id}
              point={point}
              onClick={handleMarkerClick}
              icon={icon}
              isSelected={isSelected}
            />
          )
        })}

      </GoogleMap>

      <ClientDetailsSheet
        point={detailsPoint}
        open={detailsPoint !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsPointId(null)
            selectPoint(null)
          }
        }}
      />
    </div>
  )
}

export { MapComponent }
