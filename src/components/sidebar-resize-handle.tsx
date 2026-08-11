"use client"

import { useCallback, useState } from "react"

import { useSidebar } from "@/components/ui/sidebar"
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarWidth,
} from "@/lib/sidebar-width"
import { cn } from "@/lib/utils"

const KEYBOARD_STEP = 16

/**
 * Faixa de arraste na borda direita da barra lateral. Fica fora do fluxo (fixed,
 * ancorada em `--sidebar-width`) para não alterar o layout interno do Sidebar.
 */
export function SidebarResizeHandle() {
  const { state, isMobile } = useSidebar()
  const [width, setWidth] = useSidebarWidth()
  const [isDragging, setIsDragging] = useState(false)

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()

      const startX = event.clientX
      const startWidth = width
      setIsDragging(true)

      const previousCursor = document.body.style.cursor
      const previousSelect = document.body.style.userSelect
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      // Desliga a transição de largura do Sidebar: durante o arraste ela atrasa o cursor.
      document.body.dataset.sidebarResizing = "true"

      const handleMove = (moveEvent: PointerEvent) => {
        setWidth(startWidth + (moveEvent.clientX - startX), { persist: false })
      }

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousSelect
        delete document.body.dataset.sidebarResizing
        setIsDragging(false)
        // Grava só ao soltar.
        setWidth(startWidth + (upEvent.clientX - startX))
      }

      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", handleUp)
    },
    [setWidth, width],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        setWidth(width - KEYBOARD_STEP)
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        setWidth(width + KEYBOARD_STEP)
      }
    },
    [setWidth, width],
  )

  // Recolhida ou no mobile (onde vira overlay) não há o que redimensionar.
  if (isMobile || state === "collapsed") return null

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar barra lateral"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
      title="Arraste para redimensionar · duplo clique para restaurar"
      className={cn(
        "group/resize fixed inset-y-0 z-20 hidden w-2 -translate-x-1 cursor-col-resize md:block",
        "focus-visible:outline-none",
      )}
      style={{ left: "var(--sidebar-width)" }}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-sidebar-border transition-colors",
          "group-hover/resize:bg-blue-500 group-focus-visible/resize:bg-blue-500",
          isDragging && "bg-blue-500",
        )}
      />
    </div>
  )
}
