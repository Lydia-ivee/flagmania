/**
 * Typed answer checking. Forgiving about case, accents, punctuation, spacing and small typos,
 * strict about naming a different country.
 */

/**
 * Lowercase, no accents, no leading "the", letters and digits only. "&" reads as "and" and a
 * whole-word "St" or "St." as "Saint", so "St Kitts & Nevis" meets "Saint Kitts and Nevis".
 */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/(^|[^\p{L}])st\.?(?=\s)/gu, '$1saint')
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
  /** True when the answer fits this item and another one equally well. */
  ambiguous: boolean
}

const wrong: TypedResult = { correct: false, exact: false, ambiguous: false }

/**
 * @param primary The main answers, such as a country's name or its capitals. These allow typos.
 * @param rivals Answers for other items. Typing one of these is always wrong, so "Australia"
 *   never passes as a typo of "Austria".
 * @param aliases Other accepted names, such as "Ivory Coast". These must match exactly, because
 *   alias lists hold odd entries that would let near misses through.
 */
export function checkTyped(
  input: string,
  primary: readonly string[],
  rivals: readonly string[],
  aliases: readonly string[] = [],
): TypedResult {
  const typed = normalise(input)
  if (!typed) return wrong

  const targets = primary.flatMap(variants)
  const rivalTargets = new Set(rivals.flatMap(variants))
  const exactHit = targets.includes(typed) || aliases.map(normalise).includes(typed)

  if (exactHit) {
    // "Congo" names two countries, so it cannot count for either.
    return rivalTargets.has(typed)
      ? { correct: false, exact: false, ambiguous: true }
      : { correct: true, exact: true, ambiguous: false }
  }
  if (rivalTargets.has(typed)) return wrong

  const closest = Math.min(...targets.map((t) => editDistance(typed, t)))
  const closeEnough = targets.some((t) => editDistance(typed, t) <= allowedTypos(t.length))
  if (!closeEnough) return wrong

  // A typo as close to another answer as to this one could be either, so it does not count.
  for (const rival of rivalTargets) {
    if (editDistance(typed, rival) <= closest) return { ...wrong, ambiguous: true }
  }
  return { correct: true, exact: false, ambiguous: false }
}
