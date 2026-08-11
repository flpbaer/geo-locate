/**
 * Divide uma linha de CSV respeitando campos entre aspas — necessário porque
 * endereços e nomes de cidade frequentemente contêm vírgulas.
 */
export function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (char === "," && !insideQuotes) {
      values.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values.map((value) => value.replace(/^"|"$/g, "").trim())
}

export interface CSVColumnIndexes {
  name: number
  lat: number
  lng: number
  description: number
  category: number
  color: number
  city: number
  state: number
}

export function findCSVColumns(headers: string[]): CSVColumnIndexes {
  const find = (predicate: (header: string) => boolean) => headers.findIndex(predicate)

  return {
    name: find((h) => h.includes("name") || h.includes("nome")),
    lat: find((h) => h.includes("lat")),
    lng: find((h) => h.includes("lng") || h.includes("lon")),
    description: find((h) => h.includes("desc")),
    category: find((h) => h.includes("category") || h.includes("categoria")),
    color: find((h) => h === "color" || h === "cor"),
    city: find((h) => h.includes("cidade") || h.includes("city") || h.includes("munic")),
    state: find((h) => h.includes("estado") || h.includes("state") || h === "uf"),
  }
}

export function valueAt(values: string[], index: number): string | undefined {
  if (index < 0) return undefined
  const value = values[index]
  return value && value.length > 0 ? value : undefined
}
