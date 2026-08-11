"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface StatTileProps {
  label: string
  value: ReactNode
  hint?: string
  hero?: boolean
}

export function StatTile({ label, value, hint, hero = false }: StatTileProps) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold leading-none text-foreground", hero ? "text-5xl" : "text-2xl")}>{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
