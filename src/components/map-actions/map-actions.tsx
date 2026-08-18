"use client"

import { Circle as CircleIcon, Eraser, Hexagon, Layers, Plus, Upload, Users } from "lucide-react"
import { motion } from "motion/react"
import { useRef, useState } from "react"

import { useAreas } from "@/components/areas/areas-provider"
import { ImportCSVDialog } from "@/components/import-csv/import-csv-dialog"
import { RadialMenu, type RadialAction } from "@/components/map-actions/radial-menu"
import { useMapPoints } from "@/components/map-points-provider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Ações de criação do mapa, atrás de um botão de mais no canto.
 *
 * Desenhar área e importar clientes são ações pontuais: ocupavam barra e canto o tempo
 * todo para serem usadas uma vez por sessão. Agora moram num disco que abre no toque —
 * e o mapa fica livre.
 */
export function MapActions() {
  const { areas, drawingKind, startDrawing, isAreasPanelOpen, toggleAreasPanel } = useAreas()
  const { points, isLoading, clearPoints } = useMapPoints()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isClearOpen, setIsClearOpen] = useState(false)

  /** O clique que vem depois do pointerdown do mesmo toque não deve alternar de novo. */
  const handledByPointer = useRef(false)

  const toggleMenu = () => setIsMenuOpen((current) => !current)

  const actions: RadialAction[] = [
    {
      id: "circle",
      label: "Raio",
      hint: "Um clique marca o centro, o outro fixa o raio",
      icon: CircleIcon,
      isActive: drawingKind === "circle",
      onSelect: () => startDrawing("circle"),
    },
    {
      id: "polygon",
      label: "Polígono",
      hint: "Marque os vértices do território",
      icon: Hexagon,
      isActive: drawingKind === "polygon",
      onSelect: () => startDrawing("polygon"),
    },
    {
      id: "import",
      label: "Importar CSV",
      hint: "Troca a base de clientes do mapa",
      icon: Upload,
      onSelect: () => setIsImportOpen(true),
    },
  ]

  // Limpar antes de importar: o CSV novo já substitui a base, mas quem quer só esvaziar
  // o mapa não precisa passar pelo import para isso.
  if (points.length > 0) {
    actions.push({
      id: "clear",
      label: "Limpar clientes",
      hint: `Remove os ${points.length.toLocaleString("pt-BR")} clientes do mapa`,
      icon: Eraser,
      onSelect: () => setIsClearOpen(true),
    })
  }

  // O painel de áreas fica minimizado por padrão; esta é a porta de volta para ele.
  if (areas.length > 0 || drawingKind) {
    actions.push({
      id: "areas",
      label: "Áreas",
      hint: isAreasPanelOpen
        ? "Minimizar o painel"
        : `${areas.length.toLocaleString("pt-BR")} salva(s) — abrir o painel`,
      icon: Layers,
      isActive: isAreasPanelOpen,
      onSelect: toggleAreasPanel,
    })
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        title="Criar área ou importar clientes"
        // Abre na pressão, não no clique: é isso que permite segurar, girar até a fatia
        // e soltar — o menu escolhe pelo gesto sem exigir um segundo toque.
        onPointerDown={() => {
          handledByPointer.current = true
          toggleMenu()
        }}
        onClick={() => {
          if (handledByPointer.current) {
            handledByPointer.current = false
            return
          }
          toggleMenu()
        }}
        className="absolute right-3 top-3 z-50 flex size-12 cursor-pointer items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform active:scale-95 md:right-4 md:top-4 md:size-11"
      >
        <motion.span
          className="flex"
          animate={{ rotate: isMenuOpen ? 135 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
        >
          <Plus className="h-6 w-6" />
        </motion.span>
        <span className="sr-only">Abrir menu de ações</span>
      </button>

      <RadialMenu
        open={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        actions={actions}
        title="Segure e gire, ou toque numa opção"
      />

      {/* Sem clientes o mapa não diz o que fazer — e o importar mora no disco. */}
      {!isLoading && points.length === 0 && !drawingKind && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="pointer-events-auto w-full max-w-xs rounded-xl border bg-card/95 p-4 text-center shadow-lg backdrop-blur">
            <Users className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold text-foreground">Nenhum cliente no mapa</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Importe um CSV com nome, latitude e longitude para começar.
            </p>
            <Button size="sm" className="mt-3 w-full cursor-pointer" onClick={() => setIsImportOpen(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Importar CSV
            </Button>
          </div>
        </div>
      )}

      <ImportCSVDialog open={isImportOpen} onOpenChange={setIsImportOpen} />

      <AlertDialog open={isClearOpen} onOpenChange={setIsClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Limpar {points.length.toLocaleString("pt-BR")} cliente(s) do mapa?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A base sai do mapa e você pode importar outro CSV. Suas áreas continuam salvas — elas passam a
              contar zero cliente até a próxima importação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }), "cursor-pointer")}
              onClick={() => void clearPoints()}
            >
              Limpar clientes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
