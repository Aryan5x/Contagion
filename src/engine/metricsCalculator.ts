import type { Metrics, StepRecord } from './types'
import { I, R, S } from './types'
import type { Simulation } from './epidemicModel'
import { detectionActive } from './interventionEngine'

export const EARLY_DAYS = 5

/** All metrics are derived from the simulation's actual state and history. */
export function computeMetrics(sim: Simulation): Metrics {
  const n = sim.graph.n
  const c = sim.counts
  let peak = 0
  let peakDay = 0
  for (const h of sim.history) {
    if (h.I > peak) {
      peak = h.I
      peakDay = h.day
    }
  }
  // Early-phase reproduction number: mean onward infections of the cases infected in the first
  // EARLY_DAYS days that have finished their infectious period. (Averaged over a whole epidemic this
  // is always close to 1, so it would say nothing; the early phase is the one comparable with R0.)
  let done = 0
  let doneSecondary = 0
  for (let v = 0; v < n; v++) {
    if (sim.status[v] === R && !sim.vaccinated[v] && sim.infectionDay[v] !== -1 && sim.infectionDay[v] <= EARLY_DAYS) {
      done++
      doneSecondary += sim.secondary[v]
    }
  }
  return {
    day: sim.day,
    population: n,
    susceptible: c.S,
    infected: c.I,
    removed: c.R,
    recovered: c.R - sim.vaccinatedTotal,
    vaccinated: sim.vaccinatedTotal,
    cumulativeInfections: c.cumulative,
    uninfected: n - c.cumulative,
    peakInfected: peak,
    peakDay,
    attackRate: n ? c.cumulative / n : 0,
    totalIsolated: sim.everIsolated,
    currentlyIsolated: sim.currentlyIsolated,
    totalQuarantined: sim.everQuarantined,
    currentlyQuarantined: sim.currentlyQuarantined,
    observedR: done ? doneSecondary / done : null,
    finished: sim.isFinished(),
  }
}

/** Reduction (%) = (baseline - intervention) / baseline x 100; 0 when the baseline is 0. */
export function percentReduction(baseline: number, intervention: number): number {
  if (!(baseline > 0)) return 0
  return ((baseline - intervention) / baseline) * 100
}

export function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

/** Sample standard deviation (n - 1); 0 for fewer than 2 samples. */
export function stdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

/** Mean and sd of one field across several runs, aligned by day (finished runs hold their last value). */
export function aggregateSeries(
  runs: ReadonlyArray<readonly StepRecord[]>,
  field: 'S' | 'I' | 'R' | 'newInfections' | 'cumulative',
  length?: number,
): Array<{ day: number; mean: number; sd: number }> {
  const len = length ?? Math.max(1, ...runs.map((r) => r.length))
  const out: Array<{ day: number; mean: number; sd: number }> = []
  for (let d = 0; d < len; d++) {
    const vals = runs.map((r) => {
      const rec = r[Math.min(d, r.length - 1)]
      // After the epidemic ends there are no new infections.
      return d >= r.length && field === 'newInfections' ? 0 : rec[field]
    })
    out.push({ day: d, mean: mean(vals), sd: stdDev(vals) })
  }
  return out
}

/**
 * Verifies every mathematical invariant required of the SIR model against the finished/ongoing state.
 * Returns human-readable violations; an empty list means the state is consistent.
 */
export function checkInvariants(sim: Simulation): string[] {
  const bad: string[] = []
  const g = sim.graph
  const n = g.n
  let s = 0
  let i = 0
  let r = 0
  for (let v = 0; v < n; v++) {
    const st = sim.status[v]
    if (st === S) s++
    else if (st === I) i++
    else if (st === R) r++
    else bad.push(`vertex ${v} has invalid status ${st}`)
    if (sim.vaccinated[v] && (st !== R || sim.infectionDay[v] !== -1)) bad.push(`vaccinated vertex ${v} was infected`)
  }
  const c = sim.counts
  if (s + i + r !== n) bad.push(`S+I+R = ${s + i + r}, expected ${n}`)
  if (s !== c.S || i !== c.I || r !== c.R) bad.push('cached counters disagree with the vertex states')
  for (const h of sim.history) {
    if (h.S + h.I + h.R !== n) bad.push(`day ${h.day}: S+I+R = ${h.S + h.I + h.R}, expected ${n}`)
  }

  const iso = sim.config.interventions.isolation
  const detecting = detectionActive(sim.config.interventions)
  const dist = sim.config.interventions.distancing
  const inQuarantine = (v: number, d: number) => sim.quarantineFrom[v] !== -1 && sim.quarantineFrom[v] <= d && d < sim.quarantineUntil[v]
  const seen = new Set<number>()
  let secondarySum = 0
  for (const e of sim.log) {
    const d0 = e.day - 1
    if (seen.has(e.target)) bad.push(`vertex ${e.target} infected twice`)
    seen.add(e.target)
    if (sim.vaccinated[e.target]) bad.push(`vaccinated vertex ${e.target} infected`)
    if (sim.infectionDay[e.target] !== e.day) bad.push(`vertex ${e.target}: infection day does not match the log`)
    const [a, b] = g.edges[e.edge]
    if (!((a === e.source && b === e.target) || (b === e.source && a === e.target)))
      bad.push(`transmission ${e.source}->${e.target} has no connecting edge`)
    if (dist.enabled && d0 >= dist.startDay && sim.edgeDistanced[e.edge])
      bad.push(`transmission ${e.source}->${e.target} crossed a distanced edge`)
    if (sim.infectionDay[e.source] === -1 || sim.infectionDay[e.source] > d0)
      bad.push(`source ${e.source} was not yet infectious on day ${d0}`)
    if (sim.recoveryDay[e.source] !== -1 && sim.recoveryDay[e.source] <= d0)
      bad.push(`source ${e.source} had already recovered on day ${d0}`)
    const id = sim.isolationDay[e.source]
    if (detecting && id !== -1 && id <= d0 && d0 < id + iso.duration)
      bad.push(`source ${e.source} transmitted while isolated`)
    if (inQuarantine(e.source, d0)) bad.push(`source ${e.source} transmitted while in quarantine`)
    if (inQuarantine(e.target, d0)) bad.push(`vertex ${e.target} was infected while in quarantine`)
    secondarySum++
  }
  for (let v = 0; v < n; v++) {
    const seeded = sim.initialInfected.includes(v)
    if (sim.infectionDay[v] !== -1 && !seeded && !seen.has(v)) bad.push(`vertex ${v} infected without a logged source`)
  }
  const sec = sim.secondary.reduce((a, b) => a + b, 0)
  if (sec !== secondarySum) bad.push('secondary-infection counts disagree with the transmission log')
  if (c.cumulative !== sim.initialInfected.length + sim.log.length) bad.push('cumulative infections disagree with the log')
  return bad
}
