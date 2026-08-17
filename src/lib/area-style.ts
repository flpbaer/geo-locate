import type { Area, AreaStyle } from "@/types/area"

/**
 * Paleta categórica do design system, nos passos claros — os overlays ficam sobre os
 * tiles do Google Maps, que são claros independentemente do tema do app.
 */
export const AREA_HUES: { label: string; value: string }[] = [
  { label: "Azul", value: "#2a78d6" },
  { label: "Laranja", value: "#eb6834" },
  { label: "Verde-água", value: "#1baf7a" },
  { label: "Violeta", value: "#4a3aa7" },
  { label: "Amarelo", value: "#eda100" },
  { label: "Magenta", value: "#e87ba4" },
  { label: "Verde", value: "#008300" },
  { label: "Vermelho", value: "#e34948" },
]

/**
 * Quantas cores entram no ciclo automático de novas áreas.
 *
 * Áreas podem se sobrepor em qualquer combinação, então o critério é o gate
 * "all-pairs" do validador de paleta, não o de pares adjacentes: os 4 primeiros tons
 * passam (pior par ΔE 9.2 CVD / 16.3 visão normal sobre superfície clara), o 5º não.
 * Os 8 seguem disponíveis para escolha manual, onde o nome da área carrega a
 * identidade e a cor é preferência do usuário.
 */
export const AUTO_CYCLE_LENGTH = 4

export const DEFAULT_FILL_OPACITY = 0.18
export const DEFAULT_STROKE_WEIGHT = 2

export function styleFromHue(hue: string): AreaStyle {
  return {
    strokeColor: hue,
    fillColor: hue,
    fillOpacity: DEFAULT_FILL_OPACITY,
    strokeWeight: DEFAULT_STROKE_WEIGHT,
  }
}

/** Cor padrão por posição no ciclo. */
export function defaultStyleFor(index: number): AreaStyle {
  return styleFromHue(AREA_HUES[index % AUTO_CYCLE_LENGTH].value)
}

/**
 * Cor de uma nova área: o primeiro tom do ciclo que ainda não está em uso.
 *
 * Contar as áreas existentes não serve — criar A e B, excluir A e criar C daria a C a
 * mesma cor de B. Esgotado o ciclo, volta a alternar por posição.
 */
export function nextStyle(usedColors: string[]): AreaStyle {
  const used = new Set(usedColors.map((color) => color.toLowerCase()))
  const free = AREA_HUES.slice(0, AUTO_CYCLE_LENGTH).find((hue) => !used.has(hue.value.toLowerCase()))

  return free ? styleFromHue(free.value) : defaultStyleFor(usedColors.length)
}

/** Áreas salvas antes deste campo existir não têm `style` — caem no padrão. */
export function resolveAreaStyle(area: Pick<Area, "style"> | null | undefined): AreaStyle {
  return area?.style ?? styleFromHue(AREA_HUES[0].value)
}
