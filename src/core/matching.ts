/**
 * Typed answer checking. Forgiving about case, accents, punctuation, spacing and small typos,
 * strict about naming a different country.
 */

/** Lowercase, no accents, no leading "the", letters and digits only. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** "Washington, D.C." also accepts "Washington". "Bolivia (Plurinational State of)" accepts "Bolivia". */
function variants(answer: string): string[] {
  const short = answer.split(/[,(]/)[0] ?? answer
  return [...new Set([answer, short].map(normalise).filter(Boolean))]
}

/** Edit distance where swapping two neighbouring letters counts as one edit. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  const at = (i: number, j: number) => d[i]?.[j] ?? Infinity
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1)
      }
      ;(d[i] as number[])[j] = best
    }
  }
  return at(a.length, b.length)
}

/** Typos allowed for an answer of this many letters. */
export const allowedTypos = (length: number) => (length <= 3 ? 0 : length <= 6 ? 1 : 2)

export type TypedResult = {
  correct: boolean
  /** True when the answer matched without any typo. */
  exact: boolean
}

/**
 * @param accepted Every answer that counts, such as a name and its alternatives.
 * @param rivals Answers for other items. Typing one of these is always wrong, so "Australia"
 *   never passes as a typo of "Austria".
 */
export function checkTyped(
  input: string,
  accepted: readonly string[],
  rivals: readonly string[],
): TypedResult {
  const typed = normalise(input)
  if (!typed) return { correct: false, exact: false }

  const targets = accepted.flatMap(variants)
  if (targets.includes(typed)) return { correct: true, exact: true }

  const rivalTargets = new Set(rivals.flatMap(variants))
  if (rivalTargets.has(typed)) return { correct: false, exact: false }

  const closest = Math.min(...targets.map((t) => editDistance(typed, t)))
  const closeEnough = targets.some((t) => editDistance(typed, t) <= allowedTypos(t.length))
  if (!closeEnough) return { correct: false, exact: false }

  // A typo that sits closer to another answer is more likely that answer.
  for (const rival of rivalTargets) {
    if (editDistance(typed, rival) < closest) return { correct: false, exact: false }
  }
  return { correct: true, exact: false }
}
