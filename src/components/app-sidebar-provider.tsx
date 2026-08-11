"use client"

import type { ReactNode } from "react"

import { SidebarProvider } from "@/components/ui/sidebar"
import { useSidebarWidth } from "@/lib/sidebar-width"

/**
 * Injeta a largura escolhida pelo usuário no `--sidebar-width` que o SidebarProvider
 * define — é por aqui que o arraste da barra lateral chega ao layout.
 */
export function AppSidebarProvider({ children }: { children: ReactNode }) {
  const [width] = useSidebarWidth()

  return <SidebarProvider style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}>{children}</SidebarProvider>
}
