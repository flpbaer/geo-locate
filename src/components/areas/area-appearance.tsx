"use client"

import { ChevronDown, Palette, RotateCcw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AREA_HUES, AUTO_CYCLE_LENGTH, resolveAreaStyle, styleFromHue } from "@/lib/area-style"
import { cn } from "@/lib/utils"
import type { Area, AreaStyle } from "@/types/area"

interface AreaAppearanceProps {
  area: Area
  onChange: (style: AreaStyle) => void
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-1 items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        aria-label={label}
      />
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{label}</span>
    </label>
  )
}

export function AreaAppearance({ area, onChange }: AreaAppearanceProps) {
  const [isOpen, setIsOpen] = useState(false)
  const style = resolveAreaStyle(area)

  const patch = (changes: Partial<AreaStyle>) => onChange({ ...style, ...changes })

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent/60">
        <Palette className="h-3.5 w-3.5" />
        Aparência
        <span
          className="ml-auto h-3.5 w-3.5 rounded-full border"
          style={{ backgroundColor: style.fillColor, borderColor: style.strokeColor }}
          aria-hidden
        />
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 px-1 pb-1 pt-2">
        <div>
          <p className="text-[11px] text-muted-foreground">Cor da área</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {AREA_HUES.map((hue, index) => {
              const isSelected = style.strokeColor.toLowerCase() === hue.value.toLowerCase()

              return (
                <button
                  key={hue.value}
                  type="button"
                  onClick={() => patch(styleFromHue(hue.value))}
                  className={cn(
                    "h-6 w-6 cursor-pointer rounded-full border-2 transition-transform hover:scale-110",
                    isSelected ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: hue.value }}
                  // As 4 primeiras são as usadas no ciclo automático de novas áreas.
                  title={index < AUTO_CYCLE_LENGTH ? `${hue.label} (padrão)` : hue.label}
                  aria-label={hue.label}
                  aria-pressed={isSelected}
                />
              )
            })}
          </div>
        </div>

        <div className="flex gap-1.5">
          <ColorField label="Borda" value={style.strokeColor} onChange={(strokeColor) => patch({ strokeColor })} />
          <ColorField label="Fundo" value={style.fillColor} onChange={(fillColor) => patch({ fillColor })} />
        </div>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            Opacidade do fundo — {Math.round(style.fillOpacity * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={60}
            step={2}
            value={Math.round(style.fillOpacity * 100)}
            onChange={(event) => patch({ fillOpacity: Number(event.target.value) / 100 })}
            className="mt-1 w-full cursor-pointer accent-foreground"
          />
        </label>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">Espessura da borda — {style.strokeWeight}px</span>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={style.strokeWeight}
            onChange={(event) => patch({ strokeWeight: Number(event.target.value) })}
            className="mt-1 w-full cursor-pointer accent-foreground"
          />
        </label>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-full cursor-pointer text-[11px]"
          onClick={() => onChange(styleFromHue(style.strokeColor))}
        >
          <RotateCcw className="mr-1.5 h-3 w-3" />
          Restaurar opacidade e espessura
        </Button>
      </CollapsibleContent>
    </Collapsible>
  )
}
