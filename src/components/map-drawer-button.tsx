"use client"

import { Users } from "lucide-react"

import { useSidebar } from "@/components/ui/sidebar"

/**
 * Abre a lista de clientes no celular, onde a barra lateral é uma gaveta fechada — o
 * gatilho que existia morava dentro dela, e portanto era inalcançável.
 */
export function MapDrawerButton() {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      type="button"
      title="Clientes"
      onClick={toggleSidebar}
      className="absolute left-3 top-3 z-30 flex size-12 cursor-pointer items-center justify-center rounded-full border bg-card text-foreground shadow-lg transition-transform active:scale-95 md:hidden"
    >
      <Users className="h-5 w-5" />
      <span className="sr-only">Abrir lista de clientes</span>
    </button>
  )
}
