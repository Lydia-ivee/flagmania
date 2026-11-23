import data from './countries.json'

export type Country = (typeof data.countries)[number]

export const countries: readonly Country[] = data.countries
export const dataGeneratedAt = data.generatedAt

export const flagUrl = (country: Country) => `${import.meta.env.BASE_URL}flags/${country.iso2}.svg`
