export const BR_STATES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
}

export const BR_REGIONS: Record<string, string> = {
  AC: "Norte",
  AP: "Norte",
  AM: "Norte",
  PA: "Norte",
  RO: "Norte",
  RR: "Norte",
  TO: "Norte",
  AL: "Nordeste",
  BA: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  PB: "Nordeste",
  PE: "Nordeste",
  PI: "Nordeste",
  RN: "Nordeste",
  SE: "Nordeste",
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
  ES: "Sudeste",
  MG: "Sudeste",
  RJ: "Sudeste",
  SP: "Sudeste",
  PR: "Sul",
  RS: "Sul",
  SC: "Sul",
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

const STATE_BY_NAME: Record<string, string> = Object.entries(BR_STATES).reduce<Record<string, string>>(
  (acc, [uf, name]) => {
    acc[normalizeText(name)] = uf
    return acc
  },
  {},
)

/**
 * Aceita "SP", "sp", "São Paulo" ou "Sao Paulo" e devolve sempre a sigla (UF).
 * Devolve null quando não reconhece o valor.
 */
export function toStateCode(value?: string | null): string | null {
  if (!value) return null

  const raw = value.trim()
  if (!raw) return null

  const upper = raw.toUpperCase()
  if (upper.length === 2 && BR_STATES[upper]) return upper

  return STATE_BY_NAME[normalizeText(raw)] ?? null
}

export function getStateName(uf: string): string {
  return BR_STATES[uf] ?? uf
}

export function getStateRegion(uf: string): string | null {
  return BR_REGIONS[uf] ?? null
}

export function normalizeCityKey(city: string, uf?: string | null): string {
  return `${normalizeText(city)}|${uf ?? ""}`
}
