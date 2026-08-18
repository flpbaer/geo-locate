"use client"

import { useEffect } from "react"

/** Parte do padrão Screen Wake Lock que usamos — ainda fora do lib.dom em alguns TS. */
interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> }
}

/**
 * Mantém a tela acesa enquanto `enabled`.
 *
 * Em campo o celular apaga a tela no meio do trajeto e o painel do modo GPS some junto.
 * O bloqueio é reconquistado quando a aba volta a ficar visível — o navegador o solta
 * sozinho ao trocar de app, e sem isso a tela voltaria a apagar depois da primeira troca.
 * Onde a API não existe (ou o navegador nega), o modo segue funcionando sem ela.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return

    const wakeLock = (navigator as Navigator & WakeLockNavigator).wakeLock
    if (!wakeLock) return

    let cancelled = false
    let sentinel: WakeLockSentinelLike | null = null

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return
      if (sentinel && !sentinel.released) return

      try {
        sentinel = await wakeLock.request("screen")
      } catch {
        // Negado (aba em segundo plano, bateria fraca): a tela apaga como de costume.
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire()
    }

    void acquire()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      void sentinel?.release().catch(() => {})
    }
  }, [enabled])
}
