// Builds src/data/countries.json and public/flags/ from Wikidata and flag-icons.
// Run with `npm run data`. The output is committed so normal builds need no network.

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { normalise } from '../src/core/matching.ts'

type UnState = { iso2: string; unStatus: 'member' | 'observer' }

type FlagIconsEntry = {
  code: string
  name: string
  capital: string
  continent: string
  iso: boolean
}

type Override = {
  iso2: string
  addCapitals?: string[]
  addCapitalAltNames?: string[]
  reason: string
}

type Country = {
  iso2: string
  wikidata: string
  name: string
  altNames: string[]
  capitals: string[]
  capitalAltNames: string[]
  region: string
  unStatus: UnState['unStatus']
}

const root = new URL('../', import.meta.url)
const at = (path: string) => new URL(path, root)

const userAgent = 'flagmania-build/0.1 (https://github.com/Lydia-ivee/flagmania)'
const endpoint = 'https://query.wikidata.org/sparql'

const states: UnState[] = JSON.parse(await readFile(at('scripts/un-states.json'), 'utf8'))
const flagIcons: FlagIconsEntry[] = JSON.parse(
  await readFile(at('node_modules/flag-icons/country.json'), 'utf8'),
)
const flagIconsByCode = new Map(flagIcons.map((entry) => [entry.code, entry]))
// Editorial changes to Wikidata, each with a written reason. See docs/PRD.md, OQ-6.
const overrides: Override[] = JSON.parse(await readFile(at('scripts/overrides.json'), 'utf8'))

// One row per Wikidata item carrying each ISO code. Capitals with an end date or a
// deprecated rank are left out, so former capitals such as Almaty do not appear.
// Wikidata now stores some names only as a language-neutral "mul" label, so English
// falls back to that.
const query = `
SELECT ?item ?iso ?label ?sovereign
  (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
  (GROUP_CONCAT(DISTINCT ?capitalLabel; separator="|") AS ?capitals)
  (GROUP_CONCAT(DISTINCT ?capitalAlias; separator="|") AS ?capitalAliases)
WHERE {
  VALUES ?iso { ${states.map((s) => `"${s.iso2.toUpperCase()}"`).join(' ')} }
  ?item wdt:P297 ?iso .
  OPTIONAL { ?item rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
  OPTIONAL { ?item rdfs:label ?labelMul FILTER(LANG(?labelMul) = "mul") }
  BIND(COALESCE(?labelEn, ?labelMul) AS ?label)
  BIND(EXISTS { ?item wdt:P31 wd:Q3624078 } AS ?sovereign)
  OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) IN ("en", "mul")) }
  OPTIONAL {
    ?item p:P36 ?statement .
    ?statement ps:P36 ?capital .
    FILTER NOT EXISTS { ?statement pq:P582 ?ended }
    FILTER NOT EXISTS { ?statement wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?capital rdfs:label ?capitalEn FILTER(LANG(?capitalEn) = "en") }
    OPTIONAL { ?capital rdfs:label ?capitalMul FILTER(LANG(?capitalMul) = "mul") }
    BIND(COALESCE(?capitalEn, ?capitalMul) AS ?capitalLabel)
    OPTIONAL { ?capital skos:altLabel ?capitalAlias FILTER(LANG(?capitalAlias) IN ("en", "mul")) }
  }
}
GROUP BY ?item ?iso ?label ?sovereign`

type Row = Record<
  'item' | 'iso' | 'label' | 'sovereign' | 'aliases' | 'capitals' | 'capitalAliases',
  { value: string }
>

const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}`, {
  headers: { Accept: 'application/sparql-results+json', 'User-Agent': userAgent },
})
if (!response.ok) throw new Error(`Wikidata returned ${response.status}`)
const rows: Row[] = (await response.json()).results.bindings

const split = (value: string) => (value ? value.split('|').filter(Boolean) : [])

// Aliases on Wikidata include codes, emoji, abbreviations and other scripts. Keep plain
// Latin-script names only. These are used to accept typed answers and are never shown.
// Commas and brackets mark inverted or qualified forms such as "Lanka, Sri" or
// "Korea (South)", which would let a bare "Korea" through, so those go too.
const isUsefulAlias = (alias: string) =>
  alias.replace(/[^\p{L}]/gu, '').length >= 4 &&
  /^\p{Script=Latin}[\p{Script=Latin}\p{M} '’.-]*$/u.test(alias) &&
  alias !== alias.toUpperCase()

/** "Cape" is the start of "Cape Town", not another name for it. */
const isWordPrefixOf = (alias: string, names: readonly string[]) =>
  names.some((n) => n.toLowerCase().startsWith(`${alias.toLowerCase()} `))

const problems: string[] = []
const warnings: string[] = []
const countries: Country[] = []

for (const state of states) {
  const iso = state.iso2.toUpperCase()
  const matches = rows.filter((row) => row.iso.value === iso)
  // Some codes sit on more than one item, such as the Netherlands. Prefer the sovereign state.
  const row = matches.find((m) => m.sovereign.value === 'true') ?? matches[0]
  const icons = flagIconsByCode.get(state.iso2)

  if (!row) {
    problems.push(`${iso} has no Wikidata item`)
    continue
  }
  if (!icons) {
    problems.push(`${iso} has no flag in flag-icons`)
    continue
  }

  const override = overrides.find((o) => o.iso2 === state.iso2)
  const capitals = [
    ...new Set([...split(row.capitals.value), ...(override?.addCapitals ?? [])]),
  ].sort()
  if (capitals.length === 0) problems.push(`${iso} has no current capital on Wikidata`)
  if (icons.capital && !capitals.includes(icons.capital)) {
    warnings.push(
      `${iso} capital differs. Wikidata says ${capitals.join(' or ')}, flag-icons says ${icons.capital}`,
    )
  }

  const name = icons.name
  const seen = new Set([name.toLowerCase()])
  // No prefix filter here. "Brunei" is the first word of "Brunei Darussalam" and is still its
  // everyday name.
  const altNames = [row.label.value, ...split(row.aliases.value).filter(isUsefulAlias)]
    .filter((alt) => !seen.has(alt.toLowerCase()) && seen.add(alt.toLowerCase()))
    .sort()

  const capitalSeen = new Set(capitals.map((c) => c.toLowerCase()))
  const ownNames = new Set([name, ...altNames].map(normalise))
  const fromWikidata = split(row.capitalAliases.value)
    .filter(isUsefulAlias)
    .filter((alt) => !isWordPrefixOf(alt, capitals))
    // The country's own name is not another name for its capital ("Holy See" for Vatican City).
    .filter((alt) => !ownNames.has(normalise(alt)))
  // Overrides are deliberate, so the filters above do not apply to them ("Yaren").
  const capitalAltNames = [...fromWikidata, ...(override?.addCapitalAltNames ?? [])]
    .filter((alt) => !capitalSeen.has(alt.toLowerCase()) && capitalSeen.add(alt.toLowerCase()))
    .sort()

  countries.push({
    iso2: state.iso2,
    wikidata: row.item.value.split('/').pop() ?? '',
    name,
    altNames,
    capitals,
    capitalAltNames,
    region: icons.continent,
    unStatus: state.unStatus,
  })
}

for (const override of overrides) {
  if (!states.some((s) => s.iso2 === override.iso2)) {
    problems.push(`Override for unknown code ${override.iso2}`)
  }
  if (!override.reason.trim()) problems.push(`Override for ${override.iso2} has no reason`)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}

// An alias shared by two countries, or equal to another country's main answer, would make a
// typed answer ambiguous. "Congo" is an alias of both Congos, so neither keeps it.
const dropShared = (pick: (c: Country) => string[], main: (c: Country) => string[]) => {
  const owners = new Map<string, Set<string>>()
  for (const country of countries) {
    for (const value of [...pick(country), ...main(country)]) {
      // Compare the way typed answers are compared, so "The Garden City" meets "Garden City".
      const key = normalise(value)
      owners.set(key, (owners.get(key) ?? new Set()).add(country.iso2))
    }
  }
  return (country: Country) =>
    pick(country).filter((alt) => (owners.get(normalise(alt))?.size ?? 0) === 1)
}
const keepCountryAlts = dropShared(
  (c) => c.altNames,
  (c) => [c.name],
)
// Country names count here too, since typing a country is never another country's capital.
// "The Garden City" is a name for Belmopan and for Singapore, so Belize drops it.
const keepCapitalAlts = dropShared(
  (c) => c.capitalAltNames,
  (c) => [...c.capitals, c.name, ...c.altNames],
)
for (const country of countries) {
  const altNames = keepCountryAlts(country)
  const capitalAltNames = keepCapitalAlts(country)
  country.altNames = altNames
  country.capitalAltNames = capitalAltNames
}

countries.sort((a, b) => a.name.localeCompare(b.name, 'en'))

const output = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: [
    { name: 'Wikidata', licence: 'CC0 1.0', url: 'https://www.wikidata.org' },
    { name: 'flag-icons', licence: 'MIT', url: 'https://github.com/lipis/flag-icons' },
  ],
  countries,
}

await writeFile(at('src/data/countries.json'), JSON.stringify(output, null, 2) + '\n')

await rm(at('public/flags'), { recursive: true, force: true })
await mkdir(at('public/flags'), { recursive: true })
for (const country of countries) {
  await copyFile(
    at(`node_modules/flag-icons/flags/4x3/${country.iso2}.svg`),
    at(`public/flags/${country.iso2}.svg`),
  )
}

console.log(`Wrote ${countries.length} countries and their flags.`)
if (warnings.length > 0)
  console.log(`\n${warnings.length} warnings to review\n${warnings.join('\n')}`)
