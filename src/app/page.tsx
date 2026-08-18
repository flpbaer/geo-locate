"use client"

import { AreaToolbar } from "@/components/areas/area-toolbar"
import { AreasProvider } from "@/components/areas/areas-provider"
import { GpsPanel } from "@/components/gps/gps-panel"
import { GpsProvider } from "@/components/gps/gps-provider"
import { MapActions } from "@/components/map-actions/map-actions"
import { MapComponent } from "@/components/map"
import { MapDrawerButton } from "@/components/map-drawer-button"
import { MapProvider } from "@/components/map-provider"

/**
 * O MapProvider envolve só o mapa: os painéis e as ações não dependem do SDK do Google,
 * e assim aparecem de imediato — inclusive quando o script falha em carregar.
 */
export default function HomePage() {
  return (
    <div className="relative h-full w-full">
      <AreasProvider>
        <GpsProvider>
          <MapProvider>
            <MapComponent />
          </MapProvider>

          <MapDrawerButton />
          <MapActions />
          <AreaToolbar />
          <GpsPanel />
        </GpsProvider>
      </AreasProvider>
    </div>
  )
}
