/**
 * O Node 25 expõe um `globalThis.localStorage` que só funciona com a flag
 * `--localstorage-file`. Sem ela, o objeto existe mas os métodos são `undefined` —
 * e código que faz `typeof localStorage !== "undefined"` antes de chamar
 * `getItem` (como o dev overlay do Next) quebra o SSR com
 * "localStorage.getItem is not a function".
 *
 * Aqui trocamos esse global por uma implementação em memória durante o boot do
 * servidor. No browser nada muda: o `localStorage` real continua sendo usado.
 */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()

  return {
    get length() {
      return entries.size
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null
    },
    getItem(key: string) {
      return entries.get(String(key)) ?? null
    },
    setItem(key: string, value: string) {
      entries.set(String(key), String(value))
    },
    removeItem(key: string) {
      entries.delete(String(key))
    },
    clear() {
      entries.clear()
    },
  } as Storage
}

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const existing = (globalThis as { localStorage?: Partial<Storage> }).localStorage
  if (existing && typeof existing.getItem === "function") return

  Object.defineProperty(globalThis, "localStorage", {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  })
}
