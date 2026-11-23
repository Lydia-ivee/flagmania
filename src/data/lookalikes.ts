import data from './lookalikes.json'

const byCode = new Map<string, Set<string>>()
for (const group of data.groups) {
  for (const code of group) {
    const set = byCode.get(code) ?? new Set<string>()
    for (const other of group) if (other !== code) set.add(other)
    byCode.set(code, set)
  }
}

/** Codes of flags that look like this one. Empty when there are none. */
export const lookalikesOf = (iso2: string): string[] => [...(byCode.get(iso2) ?? [])]

export const lookalikeGroups: readonly (readonly string[])[] = data.groups
