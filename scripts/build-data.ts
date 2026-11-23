// Builds src/data/countries.json and public/flags/ from Wikidata and flag-icons.
// Run with `npm run data`. The output is committed so normal builds need no network.

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'

type UnState = { iso2: string; unStatus: 'member' | 'observer' }

type FlagIconsEntry = {
  code: string
  name: string
  capital: string
  continent: string
  iso: boolean
}

type Country = {
  iso2: string
  wikidata: string
  name: string
  altNames: string[]
  capitals: string[]
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

// One row per Wikidata item carrying each ISO code. Capitals with an end date or a
// deprecated rank are left out, so former capitals such as Almaty do not appear.
// Wikidata now stores some names only as a language-neutral "mul" label, so English
// falls back to that.
const query = `
SELECT ?item ?iso ?label ?sovereign
  (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
  (GROUP_CONCAT(DISTINCT ?capitalLabel; separator="|") AS ?capitals)
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
  }
}
GROUP BY ?item ?iso ?label ?sovereign`

type Row = Record<
  'item' | 'iso' | 'label' | 'sovereign' | 'aliases' | 'capitals',
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
const isUsefulAlias = (alias: string) =>
  alias.length >= 4 &&
  /^\p{Script=Latin}[\p{Script=Latin}\p{M} '’.,()-]*$/u.test(alias) &&
  alias !== alias.toUpperCase()

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

  const capitals = split(row.capitals.value).sort()
  if (capitals.length === 0) problems.push(`${iso} has no current capital on Wikidata`)
  if (icons.capital && !capitals.includes(icons.capital)) {
    warnings.push(
      `${iso} capital differs. Wikidata says ${capitals.join(' or ')}, flag-icons says ${icons.capital}`,
    )
  }

  const name = icons.name
  const seen = new Set([name.toLowerCase()])
  const altNames = [row.label.value, ...split(row.aliases.value).filter(isUsefulAlias)]
    .filter((alt) => !seen.has(alt.toLowerCase()) && seen.add(alt.toLowerCase()))
    .sort()

  countries.push({
    iso2: state.iso2,
    wikidata: row.item.value.split('/').pop() ?? '',
    name,
    altNames,
    capitals,
    region: icons.continent,
    unStatus: state.unStatus,
  })
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
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
