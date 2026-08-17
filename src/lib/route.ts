import { distanceInMeters } from "@/lib/geo"
import type { LatLng } from "@/types/area"
import type { Point } from "@/types/point"

/**
 * Quantos pontos de partida diferentes testar quando não há origem fixa.
 *
 * Sem origem, "por qual cliente começar" só tem resposta testando cada cliente como
 * primeiro. Cada teste é O(n²), então avaliar todos custa O(n³) — tranquilo até algumas
 * dezenas de clientes. Acima disso, avalia uma amostra espaçada e informa quantos ficaram
 * de fora, em vez de travar a interface.
 */
export const MAX_STARTS_EVALUATED = 60

/** Trava de segurança: o 2-opt converge muito antes disso. */
const MAX_TWO_OPT_PASSES = 20

/** Ganho mínimo (em metros) para aceitar uma troca — evita laço infinito por float. */
const MIN_GAIN = 0.5

export interface RouteStop {
  point: Point
  /** Posição na rota, começando em 1. */
  order: number
  /** Distância desde a parada anterior — ou desde a origem, na primeira. */
  legDistance: number
  /** Distância acumulada desde o início da rota. */
  cumulativeDistance: number
}

export interface Route {
  stops: RouteStop[]
  /** Soma de todas as pernas, já incluindo a volta quando `roundTrip`. */
  totalDistance: number
  /** Distância da última parada de volta ao início (0 quando não é circular). */
  returnDistance: number
  origin: LatLng | null
  roundTrip: boolean
  /** Pontos de partida avaliados e disponíveis — iguais, exceto quando o teto agiu. */
  startsEvaluated: number
  startsAvailable: number
}

export interface RouteOptions {
  /** Ponto de partida fixo (matriz, casa, hotel). Sem ele, a ordem escolhe o melhor. */
  origin: LatLng | null
  /** Fecha o ciclo, voltando ao ponto de partida no fim. */
  roundTrip: boolean
}

type Matrix = number[][]

function buildMatrix(coords: LatLng[]): Matrix {
  const size = coords.length
  const matrix: Matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0))

  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      const distance = distanceInMeters(coords[i], coords[j])
      matrix[i][j] = distance
      matrix[j][i] = distance
    }
  }

  return matrix
}

/** Comprimento total de um percurso, fechando o ciclo quando `closed`. */
function tourLength(order: number[], matrix: Matrix, closed: boolean): number {
  let total = 0

  for (let i = 1; i < order.length; i++) {
    total += matrix[order[i - 1]][order[i]]
  }

  if (closed && order.length > 1) {
    total += matrix[order[order.length - 1]][order[0]]
  }

  return total
}

/** Constrói um percurso indo sempre ao vizinho mais próximo ainda não visitado. */
function nearestNeighbor(matrix: Matrix, start: number): number[] {
  const size = matrix.length
  const visited = new Array<boolean>(size).fill(false)
  const order = [start]
  visited[start] = true

  let current = start

  for (let step = 1; step < size; step++) {
    let nearest = -1
    let nearestDistance = Number.POSITIVE_INFINITY

    for (let candidate = 0; candidate < size; candidate++) {
      if (visited[candidate]) continue

      if (matrix[current][candidate] < nearestDistance) {
        nearestDistance = matrix[current][candidate]
        nearest = candidate
      }
    }

    if (nearest === -1) break

    visited[nearest] = true
    order.push(nearest)
    current = nearest
  }

  return order
}

/**
 * Melhora o percurso desfazendo cruzamentos: inverte trechos enquanto isso encurtar o
 * total. A primeira posição nunca se move — é o ponto de partida.
 */
function twoOpt(order: number[], matrix: Matrix, closed: boolean): number[] {
  const size = order.length
  if (size < 4) return order

  const best = [...order]

  for (let pass = 0; pass < MAX_TWO_OPT_PASSES; pass++) {
    let improved = false

    for (let i = 1; i < size - 1; i++) {
      for (let j = i + 1; j < size; j++) {
        const before = best[i - 1]
        const from = best[i]
        const to = best[j]

        // Vizinho depois do trecho: no percurso fechado, o último volta ao primeiro.
        const afterIndex = j + 1 < size ? j + 1 : closed ? 0 : -1
        const after = afterIndex >= 0 ? best[afterIndex] : -1

        // Inverter o trecho todo num ciclo fechado devolve o mesmo ciclo.
        if (closed && i === 1 && afterIndex === 0) continue

        const current = matrix[before][from] + (after >= 0 ? matrix[to][after] : 0)
        const swapped = matrix[before][to] + (after >= 0 ? matrix[from][after] : 0)

        if (swapped < current - MIN_GAIN) {
          let left = i
          let right = j
          while (left < right) {
            const temp = best[left]
            best[left] = best[right]
            best[right] = temp
            left++
            right--
          }
          improved = true
        }
      }
    }

    if (!improved) break
  }

  return best
}

/**
 * Quantos inícios vale testar. O custo é (inícios × n²), então em áreas muito grandes
 * reduzir os inícios é o que mantém o cálculo interativo. `startsEvaluated` na resposta
 * informa o que foi testado de fato, para a interface não sugerir busca exaustiva.
 */
function startBudget(size: number): number {
  if (size <= MAX_STARTS_EVALUATED) return size
  return size <= 150 ? MAX_STARTS_EVALUATED : 12
}

/** Índices de partida a testar: todos, ou uma amostra espaçada quando são muitos. */
function candidateStarts(size: number): number[] {
  const budget = startBudget(size)
  if (budget >= size) {
    return Array.from({ length: size }, (_, index) => index)
  }

  const step = size / budget
  return Array.from({ length: budget }, (_, index) => Math.floor(index * step))
}

function optimize(matrix: Matrix, start: number, closed: boolean): { order: number[]; length: number } {
  const order = twoOpt(nearestNeighbor(matrix, start), matrix, closed)
  return { order, length: tourLength(order, matrix, closed) }
}

/**
 * Ordena os clientes na sequência mais curta.
 *
 * Com origem definida, ela é a partida e a ordem só decide os clientes. Sem origem,
 * testa cada cliente como primeiro e devolve a melhor sequência — é isso que responde
 * "por qual cliente começar".
 */
export function solveRoute(points: Point[], options: RouteOptions): Route | null {
  if (points.length === 0) return null

  const { origin, roundTrip } = options
  const coords: LatLng[] = points.map((point) => ({ lat: point.lat, lng: point.lng }))

  // Com origem, ela entra como nó 0 e fica fixa na primeira posição.
  const nodes = origin ? [origin, ...coords] : coords
  const matrix = buildMatrix(nodes)

  let order: number[]
  let startsEvaluated: number
  const startsAvailable = origin ? 1 : points.length

  if (origin) {
    order = optimize(matrix, 0, roundTrip).order
    startsEvaluated = 1
  } else {
    const starts = candidateStarts(points.length)
    let bestOrder: number[] | null = null
    let bestLength = Number.POSITIVE_INFINITY

    for (const start of starts) {
      const result = optimize(matrix, start, roundTrip)
      if (result.length < bestLength) {
        bestLength = result.length
        bestOrder = result.order
      }
    }

    order = bestOrder ?? [0]
    startsEvaluated = starts.length
  }

  // Com origem, o nó 0 não é uma parada — é o ponto de partida.
  const stopIndices = origin ? order.slice(1) : order
  const stops: RouteStop[] = []
  let cumulative = 0

  stopIndices.forEach((nodeIndex, position) => {
    const previousNode = position === 0 ? (origin ? 0 : nodeIndex) : stopIndices[position - 1]
    const legDistance = position === 0 && !origin ? 0 : matrix[previousNode][nodeIndex]

    cumulative += legDistance

    stops.push({
      point: points[origin ? nodeIndex - 1 : nodeIndex],
      order: position + 1,
      legDistance,
      cumulativeDistance: cumulative,
    })
  })

  // Volta ao ponto de partida: a origem, ou o primeiro cliente quando não há origem.
  let returnDistance = 0
  if (roundTrip && stopIndices.length > 0) {
    const lastNode = stopIndices[stopIndices.length - 1]
    returnDistance = matrix[lastNode][origin ? 0 : stopIndices[0]]
  }

  return {
    stops,
    totalDistance: cumulative + returnDistance,
    returnDistance,
    origin,
    roundTrip,
    startsEvaluated,
    startsAvailable,
  }
}
