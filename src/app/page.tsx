"use client"

import { AreaToolbar } from "@/components/areas/area-toolbar"
import { AreasProvider } from "@/components/areas/areas-provider"
import { ImportCSVButton } from "@/components/import-csv/import-csv-button"
import { MapComponent } from "@/components/map"
import { MapProvider } from "@/components/map-provider"

export default function HomePage() {
  return (
    <div className="relative h-full w-full">
      <ImportCSVButton />
      <MapProvider>
        <AreasProvider>
          <AreaToolbar />
          <MapComponent />
        </AreasProvider>
      </MapProvider>
    </div>
  )
}
