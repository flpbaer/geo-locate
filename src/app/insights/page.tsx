"use client"

import { InsightsPanel } from "@/components/insights/insights-panel"
import { MapProvider } from "@/components/map-provider"

export default function InsightsPage() {
  return (
    // O MapProvider carrega o SDK do Google Maps, usado aqui para a geocodificação reversa.
    <MapProvider>
      <InsightsPanel />
    </MapProvider>
  )
}
