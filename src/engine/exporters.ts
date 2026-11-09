import type { Simulation } from './epidemicModel'
import type { VariantResult } from './experimentRunner'
import type { Graph, SimConfig } from './types'
import { NETWORK_SHORT } from './graphGenerator'

/* Plain-text exports of simulation results. Pure functions with no DOM, so they can be tested. */

type Cell = string | number | boolean | null | undefined

/** One CSV field (RFC 4180): quoted when it contains a comma, quote or line break; quotes are doubled. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '') : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(header: readonly string[], rows: ReadonlyArray<readonly Cell[]>): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Short description of a configuration for file names, e.g. "ba-n250-k6-seed42". */
export function configSlug(c: SimConfig): string {
  const net = c.network
  return `${NETWORK_SHORT[net.type].toLowerCase().replace(/[^a-z0-9]+/g, '-')}-n${net.n}-k${net.avgDegree}-seed${net.seed}`
}

/** One row per simulated day: the S/I/R counts and everything derived from them. */
export function historyCSV(sim: Simulation): string {
  const vaccinated = sim.vaccinatedTotal
  return toCSV(
    ['day', 'susceptible', 'infected', 'removed', 'recovered', 'vaccinated', 'new_infections', 'cumulative_infections', 'isolated', 'quarantined'],
    sim.history.map((h) => [h.day, h.S, h.I, h.R, h.recovered, vaccinated, h.newInfections, h.cumulative, h.isolated, h.quarantined]),
  )
}

/** Every transmission: who infected whom, on which day, along which edge. Initial cases are listed with no source. */
export function transmissionsCSV(sim: Simulation): string {
  const rows: Cell[][] = sim.initialInfected.map((v) => [0, '', v, '', 'initial case'])
  for (const e of sim.log) rows.push([e.day, e.source, e.target, e.edge, 'contact'])
  return toCSV(['day', 'source', 'target', 'edge', 'kind'], rows)
}

/** The run's parameters as key/value rows, so an export can be reproduced. */
export function parametersCSV(c: SimConfig): string {
  const iv = c.interventions
  const rows: Cell[][] = [
    ['network', NETWORK_SHORT[c.network.type]],
    ['population', c.network.n],
    ['average_degree', c.network.avgDegree],
    ['rewire_probability', c.network.rewireP],
    ['seed', c.network.seed],
    ['initial_infected', c.initialInfected],
    ['beta', c.beta],
    ['gamma', c.gamma],
  ]
  for (const [k, v] of Object.entries(iv)) for (const [f, x] of Object.entries(v)) rows.push([`${k}.${f}`, x as Cell])
  return toCSV(['parameter', 'value'], rows)
}

const STAT_FIELDS = ['cumulative', 'attackRate', 'peak', 'peakDay', 'recovered', 'uninfected', 'vaccinated', 'isolated', 'quarantined', 'duration'] as const
const STAT_NAMES: Record<(typeof STAT_FIELDS)[number], string> = {
  cumulative: 'infected',
  attackRate: 'attack_rate',
  peak: 'peak_infected',
  peakDay: 'peak_day',
  recovered: 'recovered',
  uninfected: 'uninfected',
  vaccinated: 'vaccinated',
  isolated: 'isolated',
  quarantined: 'quarantined',
  duration: 'duration_days',
}

/**
 * One row per scenario or experiment variant: the mean and standard deviation of every summary
 * statistic over the runs, plus the reduction versus the baseline when one is given.
 */
export function variantsCSV(results: ReadonlyArray<VariantResult & { reduction?: number }>): string {
  const withReduction = results.some((r) => r.reduction !== undefined)
  const header = ['id', 'label', 'runs', ...STAT_FIELDS.flatMap((f) => [`${STAT_NAMES[f]}_mean`, `${STAT_NAMES[f]}_sd`]), 'major_outbreak_pct']
  if (withReduction) header.push('reduction_pct')
  const rows = results.map((r) => {
    const row: Cell[] = [r.id, r.label, r.stats.runs, ...STAT_FIELDS.flatMap((f) => [r.stats[f].mean, r.stats[f].sd]), r.stats.majorOutbreakPct]
    if (withReduction) row.push(r.reduction ?? '')
    return row
  })
  return toCSV(header, rows)
}

/** Mean and sd of infected people per day for each variant, in long format (one row per variant and day). */
export function curvesCSV(results: readonly VariantResult[]): string {
  const rows: Cell[][] = []
  for (const r of results) {
    const len = Math.max(r.curves.I.length, r.curves.S.length, r.curves.R.length)
    for (let d = 0; d < len; d++) {
      const at = (c: VariantResult['curves']['I']) => c[Math.min(d, c.length - 1)]
      rows.push([r.id, r.label, d, at(r.curves.S).mean, at(r.curves.I).mean, at(r.curves.I).sd, at(r.curves.R).mean, d < r.curves.newInfections.length ? r.curves.newInfections[d].mean : 0])
    }
  }
  return toCSV(['id', 'label', 'day', 'susceptible_mean', 'infected_mean', 'infected_sd', 'removed_mean', 'new_infections_mean'], rows)
}

/** The contact graph as an edge list (one row per edge, u < v), with each endpoint's degree. */
export function edgeListCSV(g: Graph): string {
  return toCSV(
    ['edge', 'u', 'v', 'degree_u', 'degree_v'],
    g.edges.map(([u, v], e) => [e, u, v, g.degree[u], g.degree[v]]),
  )
}
