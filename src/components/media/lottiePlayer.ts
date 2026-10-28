import type { AnimationItem } from 'lottie-web'

/**
 * The one place the panel loads a Lottie player (plan.md §2.4, phase G2).
 *
 * ⚠️ **`lottie_light`, never the default `lottie-web` entry.** The default build
 * carries an expression engine that runs a document's expressions through
 * `eval`; `lottie_light` is SVG-only and has no expression support, so a
 * catalog file cannot execute script in an admin's session. The live catalog
 * uses no expressions (measured on all 8 gifts, 2026-10-28), so nothing is
 * lost.
 *
 * ⚠️ **Loaded on demand.** The player is ~250 KB and only the catalog screens
 * need it, so it is a separate chunk rather than part of the shell every
 * operator downloads. A module of its own also gives tests one seam to stub —
 * jsdom has no SVG geometry for the player to measure.
 */

export interface LottieMountOptions {
  readonly container: Element
  readonly animationData: unknown
}

export type { AnimationItem }

export async function mountLottie({
  container,
  animationData,
}: LottieMountOptions): Promise<AnimationItem> {
  const { default: lottie } = await import('lottie-web/build/player/lottie_light')

  return lottie.loadAnimation({
    container,
    animationData,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet',
      progressiveLoad: true,
    },
  })
}
