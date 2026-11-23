import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countries } from './countries.ts'

const regions = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']

describe('country data', () => {
  it('holds the 193 UN members and the 2 observer states', () => {
    expect(countries.filter((c) => c.unStatus === 'member')).toHaveLength(193)
    expect(
      countries
        .filter((c) => c.unStatus === 'observer')
        .map((c) => c.iso2)
        .sort(),
    ).toEqual(['ps', 'va'])
  })

  it('uses each ISO code and each name once', () => {
    expect(new Set(countries.map((c) => c.iso2)).size).toBe(countries.length)
    expect(new Set(countries.map((c) => c.name)).size).toBe(countries.length)
  })

  it('gives every country a name, a capital and a known region', () => {
    for (const country of countries) {
      expect(country.name.trim(), country.iso2).not.toBe('')
      expect(country.capitals.length, country.iso2).toBeGreaterThan(0)
      expect(regions, country.iso2).toContain(country.region)
    }
  })

  it('has a flag file for every country', () => {
    for (const country of countries) {
      expect(existsSync(`public/flags/${country.iso2}.svg`), country.iso2).toBe(true)
    }
  })

  it('never repeats the display name among the alternative names', () => {
    for (const country of countries) {
      const lower = country.altNames.map((n) => n.toLowerCase())
      expect(lower, country.iso2).not.toContain(country.name.toLowerCase())
    }
  })
})
