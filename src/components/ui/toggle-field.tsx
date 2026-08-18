"use client"

/** Caixa de opção com rótulo e explicação curta, usada nos painéis do mapa. */
export function ToggleField({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-foreground">{label}</span>
        {hint && <span className="block text-[10px] leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}
