import { Inter } from "next/font/google"
import type React from "react"
import "./globals.css"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { MapPointsProvider } from "@/components/map-points-provider"
import { ClientSidebar } from "@/components/client-sidebar"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <MapPointsProvider>
          <SidebarProvider>
            <div className="flex h-screen w-full">
              <ClientSidebar />
              <SidebarInset className="flex-1">
                <main className="flex flex-1 flex-col h-full w-full">{children}</main>
              </SidebarInset>
            </div>
          </SidebarProvider>
        </MapPointsProvider>
      </body>
    </html>
  )
}
