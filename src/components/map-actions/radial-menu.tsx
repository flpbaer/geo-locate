"use client"

import type { LucideIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/** Tempo de pressão que caracteriza "segurar e girar" em vez de um toque para abrir. */
const HOLD_MS = 180

/** Fração do raio em que o ponteiro ainda está no miolo — ali nada fica apontado. */
const DEADZONE = 0.4

/** Fora disso o ponteiro saiu do disco: soltar ali fecha em vez de escolher. */
const OUTER_LIMIT = 1.15

/** Raios em unidades do viewBox de 100, com centro em (50, 50). */
const OUTER_RADIUS = 48
const INNER_RADIUS = 19.5
const LABEL_RADIUS = 34

/** Respiro entre as fatias, em graus. */
const WEDGE_GAP = 2.5

export interface RadialAction {
  id: string
  label: string
  /** Frase curta mostrada no miolo enquanto a fatia está apontada. */
  hint?: string
  icon: LucideIcon
  /** Realça a fatia — usado quando a ação já está em curso (desenho em andamento). */
  isActive?: boolean
  onSelect: () => void
}

interface RadialMenuProps {
  open: boolean
  onClose: () => void
  actions: RadialAction[]
  /** Texto do miolo quando nada está apontado. */
  title: string
}

/** Ponto na circunferência, com 0° no topo e sentido horário (igual ao conic-gradient). */
function polar(radius: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180
  return { x: 50 + radius * Math.sin(radians), y: 50 - radius * Math.cos(radians) }
}

function wedgePath(start: number, end: number): string {
  const outerStart = polar(OUTER_RADIUS, start)
  const outerEnd = polar(OUTER_RADIUS, end)
  const innerEnd = polar(INNER_RADIUS, end)
  const innerStart = polar(INNER_RADIUS, start)
  const largeArc = end - start > 180 ? 1 : 0

  return [
    `M${outerStart.x},${outerStart.y}`,
    `A${OUTER_RADIUS},${OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x},${outerEnd.y}`,
    `L${innerEnd.x},${innerEnd.y}`,
    `A${INNER_RADIUS},${INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x},${innerStart.y}`,
    "Z",
  ].join(" ")
}

/**
 * Menu em disco: as ações ficam em fatias ao redor de um miolo que nomeia a apontada.
 *
 * Dois jeitos de escolher, e o gesto define qual: quem **segura** o gatilho gira até a
 * fatia e solta — a escolha sai num movimento só, sem soltar o dedo. Quem só **toca**
 * abre o disco, que fica aberto esperando o toque na fatia.
 */
export function RadialMenu({ open, onClose, actions, title }: RadialMenuProps) {
  const span = 360 / actions.length
  const dial = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const openedAt = useRef(0)

  const select = useCallback(
    (index: number) => {
      onClose()
      actions[index]?.onSelect()
    },
    [actions, onClose],
  )

  useEffect(() => {
    if (!open) {
      setActiveIndex(null)
      return
    }

    openedAt.current = Date.now()

    /** Qual fatia o ponteiro aponta, ou null no miolo e fora do disco. */
    const indexAt = (event: PointerEvent): number | null => {
      const box = dial.current?.getBoundingClientRect()
      if (!box) return null

      const radius = box.width / 2
      const dx = event.clientX - (box.left + radius)
      const dy = event.clientY - (box.top + radius)
      const distance = Math.hypot(dx, dy) / radius

      if (distance < DEADZONE || distance > OUTER_LIMIT) return null

      // atan2 tem 0° à direita; somar 90° põe o 0° no topo, no sentido das fatias.
      const fromTop = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360
      return Math.round(fromTop / span) % actions.length
    }

    const handleMove = (event: PointerEvent) => setActiveIndex(indexAt(event))

    // Soltar o ponteiro que abriu o menu: se foi pressão longa, escolhe a fatia
    // apontada; se foi só um toque, o disco fica aberto esperando o clique.
    const handleUp = (event: PointerEvent) => {
      const index = indexAt(event)
      const wasHold = Date.now() - openedAt.current > HOLD_MS

      window.removeEventListener("pointermove", handleMove)

      if (wasHold && index !== null) select(index)
      else setActiveIndex(null)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp, { once: true })

    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [open, select, span, actions.length])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((current) => ((current ?? -1) + 1) % actions.length)
        return
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((current) => ((current ?? 0) - 1 + actions.length) % actions.length)
        return
      }

      if (event.key === "Enter" && activeIndex !== null) {
        event.preventDefault()
        select(activeIndex)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose, select, activeIndex, actions.length])

  const active = activeIndex !== null ? actions[activeIndex] : null

  /**
   * Ângulo acumulado da agulha: somar a menor diferença a cada troca faz ela ir pelo
   * caminho curto, em vez de dar a volta ao passar da última fatia para a primeira.
   */
  const needleAngle = useRef(0)
  if (activeIndex !== null) {
    const target = activeIndex * span
    needleAngle.current += ((target - needleAngle.current + 540) % 360) - 180
  }

  // A agulha é um conic-gradient da largura de uma fatia, recortado no anel. As paradas
  // do `radial-gradient` são fração da metade da caixa (`closest-side`), enquanto os
  // raios estão em unidades de um viewBox de 100 — daí o × 2.
  const needle = `conic-gradient(from ${-span / 2}deg, rgba(56,132,255,0.6), rgba(56,132,255,0.14) ${span * 0.7}deg, rgba(56,132,255,0) ${span}deg, rgba(56,132,255,0) 360deg)`
  const ring = `radial-gradient(circle closest-side, transparent ${INNER_RADIUS * 2}%, #000 ${INNER_RADIUS * 2 + 3}%, #000 ${OUTER_RADIUS * 2}%, transparent ${OUTER_RADIUS * 2 + 2}%)`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            ref={dial}
            role="menu"
            aria-label={title}
            className="relative aspect-square w-[min(84vw,320px)] touch-none select-none"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
              <circle cx="50" cy="50" r="49.5" fill="rgba(9,13,26,0.94)" />
              <circle cx="50" cy="50" r="49.5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.5" />

              {actions.map((action, index) => {
                const center = index * span
                const isActive = index === activeIndex

                return (
                  <motion.path
                    key={action.id}
                    d={wedgePath(center - span / 2 + WEDGE_GAP / 2, center + span / 2 - WEDGE_GAP / 2)}
                    fill={
                      isActive
                        ? "rgba(56,132,255,0.22)"
                        : action.isActive
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(255,255,255,0.05)"
                    }
                    stroke={isActive ? "rgba(120,175,255,0.75)" : "rgba(255,255,255,0.09)"}
                    strokeWidth="0.5"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.035, type: "spring", stiffness: 500, damping: 34 }}
                    style={{ transformOrigin: "50px 50px", transformBox: "view-box" }}
                  />
                )
              })}
            </svg>

            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: needle, maskImage: ring, WebkitMaskImage: ring }}
              animate={{ rotate: needleAngle.current, opacity: activeIndex === null ? 0 : 1 }}
              transition={{ type: "spring", stiffness: 340, damping: 26 }}
            />

            {actions.map((action, index) => {
              const position = polar(LABEL_RADIUS, index * span)
              const Icon = action.icon

              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  title={action.hint}
                  className={cn(
                    "absolute flex w-[27%] -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-center transition-colors",
                    "text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70",
                    index === activeIndex && "text-white",
                  )}
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  onPointerEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => select(index)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-medium leading-tight">{action.label}</span>
                </button>
              )
            })}

            {/* O miolo nomeia o que está apontado: o ícone sozinho não diz o suficiente. */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 w-[34%] -translate-x-1/2 -translate-y-1/2 text-center">
              {active ? (
                <>
                  <p className="text-[13px] font-semibold leading-tight text-white">{active.label}</p>
                  {active.hint && (
                    <p className="mt-1 text-[10px] leading-snug text-white/55">{active.hint}</p>
                  )}
                </>
              ) : (
                <p className="text-[11px] leading-snug text-white/55">{title}</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
