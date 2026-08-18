import type { Viewport } from "next"
import { Inter } from "next/font/google"
import type React from "react"
import "./globals.css"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppSidebarProvider } from "@/components/app-sidebar-provider"
import { MapPointsProvider } from "@/components/map-points-provider"
import { ClientSidebar } from "@/components/client-sidebar"

const inter = Inter({ subsets: ["latin"] })

/**
 * `viewportFit: "cover"` é o que dá valor a `env(safe-area-inset-*)` no iPhone — sem
 * isso o painel do modo GPS fica atrás da barra de gestos.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <MapPointsProvider>
          <AppSidebarProvider>
            <div className="flex h-[100dvh] w-full overflow-hidden">
              <ClientSidebar />
              <SidebarInset className="flex-1">
                <main className="flex flex-1 flex-col h-full w-full">{children}</main>
              </SidebarInset>
            </div>
          </AppSidebarProvider>
        </MapPointsProvider>
      </body>
    </html>
  )
}
