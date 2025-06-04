/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { GoogleMap, Marker, InfoWindow } from "@react-google-maps/api"
import { useMapPoints } from "@/components/map-points-provider"

export const defaultMapContainerStyle = {
  width: "100%",
  height: "100vh",
  borderRadius: "4px",
}

const defaultMapCenter = {
  lat: -26.888244,
  lng: -49.081448,
}

interface CSVPoint {
  id: string
  name: string
  lat: number
  lng: number
  description?: string
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
    point: CSVPoint
    onClick: (point: CSVPoint) => void
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
  const [selectedMarker, setSelectedMarker] = useState<CSVPoint | null>(null)
  const [mapCenter, setMapCenter] = useState(defaultMapCenter)
  const [mapZoom, setMapZoom] = useState(5)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [hasInitializedView, setHasInitializedView] = useState(false)

  const markerIcons = useMemo(() => {
    if (typeof window === "undefined" || !window.google) return { default: null, selected: null }

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

    return { default: defaultIcon, selected: selectedIcon }
  }, [])

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
    (point: CSVPoint) => {
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

  useEffect(() => {
    if (selectedPoint) {
      setSelectedMarker(selectedPoint)
      centerMapOnPoint(selectedPoint)
    } else {
      setSelectedMarker(null)
    }
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

  const handleMarkerClick = useCallback(
    (point: CSVPoint) => {
      selectPoint(point)
      setSelectedMarker(point)
    },
    [selectPoint],
  )
  const handleInfoWindowClose = useCallback(() => {
    setSelectedMarker(null)
    selectPoint(null)
  }, [])

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
        {importedPoints.map((point) => {
          const isSelected = selectedPoint?.id === point.id
          const icon = isSelected ? markerIcons.selected : markerIcons.default

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

        {selectedMarker && (
          <InfoWindow
            position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
            onCloseClick={handleInfoWindowClose}
            options={{
              pixelOffset: new window.google.maps.Size(0, -40),
            }}
          >
            <div className="p-3 max-w-xs">
              <h3 className="font-semibold text-base mb-2 text-gray-800">{selectedMarker.name}</h3>
              {selectedMarker.description && (
                <p className="text-sm text-gray-600 mb-3 leading-relaxed">{selectedMarker.description}</p>
              )}
              <div className="text-xs text-gray-500 space-y-1 border-t pt-2">
                <div className="flex justify-between">
                  <span className="font-medium">Latitude:</span>
                  <span className="font-mono">{selectedMarker.lat.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Longitude:</span>
                  <span className="font-mono">{selectedMarker.lng.toFixed(6)}</span>
                </div>
              </div>
              {(selectedMarker as any).category && (
                <div className="mt-2 pt-2 border-t">
                  <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    {(selectedMarker as any).category}
                  </span>
                </div>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  )
}

export { MapComponent }
