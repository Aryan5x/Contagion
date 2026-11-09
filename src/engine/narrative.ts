import type { Simulation } from './epidemicModel'
import { I } from './types'
import { detectionActive } from './interventionEngine'

/**
 * Data behind the plain-language commentary. Everything here is read from the simulation's own state and
 * transmission log, so the explanation can never disagree with what the simulation actually did.
 */

export type Phase = 'start' | 'growing' | 'peak' | 'declining' | 'over'

export interface DayReport {
  day: number
  phase: Phase
  newInfections: Array<{ source: number; target: number }>
  recoveries: number[]
  isolatedToday: number[]
  /** Traced contacts whose quarantine starts today. */
  quarantinedToday: number[]
  infectedNow: number
  infectedBefore: number | null
  peakInfected: number
  peakDay: number
  /** The individual who infected the most people on this day. */
  topSpreader: { id: number; count: number; degree: number } | null
  /** One concrete application of P = 1 - (1 - beta)^k using this day's real data. */
  example: { target: number; k: number; p: number; infected: true } | null
  initialCases: Array<{ id: number; degree: number }>
}

/**
 * Number of neighbours of v that were infectious, not isolated and joined to v by an active edge at the
 * start of the step that ends on day `day`. This is exactly the k in P = 1 - (1 - beta)^k.
 */
export function infectiousNeighboursAtStart(sim: Simulation, v: number, day: number): number {
  const d0 = day - 1
  const g = sim.graph
  const iso = sim.config.interventions.isolation
  const detecting = detectionActive(sim.config.interventions)
  const dist = sim.config.interventions.distancing
  let k = 0
  for (let i = 0; i < g.adjNodes[v].length; i++) {
    const u = g.adjNodes[v][i]
    const e = g.adjEdges[v][i]
    if (sim.infectionDay[u] === -1 || sim.infectionDay[u] > d0) continue
    if (sim.recoveryDay[u] !== -1 && sim.recoveryDay[u] <= d0) continue
    const id = sim.isolationDay[u]
    if (detecting && id !== -1 && id <= d0 && d0 < id + iso.duration) continue
    if (sim.quarantineFrom[u] !== -1 && sim.quarantineFrom[u] <= d0 && d0 < sim.quarantineUntil[u]) continue
    if (dist.enabled && d0 >= dist.startDay && sim.edgeDistanced[e]) continue
    k++
  }
  return k
}

export function explainDay(sim: Simulation): DayReport {
  const day = sim.day
  const h = sim.history
  const now = h[h.length - 1]
  const before = h.length > 1 ? h[h.length - 2] : null
  let peakInfected = 0
  let peakDay = 0
  for (const rec of h) {
    if (rec.I > peakInfected) {
      peakInfected = rec.I
      peakDay = rec.day
    }
  }

  const newInfections = day > 0 ? sim.eventsOnDay(day).map((e) => ({ source: e.source, target: e.target })) : []
  const recoveries: number[] = []
  const isolatedToday: number[] = []
  const quarantinedToday: number[] = []
  for (let v = 0; v < sim.graph.n; v++) {
    if (day > 0 && sim.recoveryDay[v] === day) recoveries.push(v)
    if (sim.isolationDay[v] === day) isolatedToday.push(v)
    if (sim.quarantineFrom[v] === day) quarantinedToday.push(v)
  }

  let phase: Phase
  if (day === 0) phase = 'start'
  else if (sim.isFinished()) phase = 'over'
  else if (before && now.I > before.I) phase = 'growing'
  else if (before && now.I < before.I) phase = 'declining'
  else phase = 'peak'

  const counts = new Map<number, number>()
  for (const e of newInfections) counts.set(e.source, (counts.get(e.source) ?? 0) + 1)
  let topSpreader: DayReport['topSpreader'] = null
  for (const [id, count] of counts) {
    if (!topSpreader || count > topSpreader.count) topSpreader = { id, count, degree: sim.graph.degree[id] }
  }

  // Worked example: the newly infected person with the most infected neighbours (most instructive for the formula).
  let example: DayReport['example'] = null
  let bestK = 0
  for (const e of newInfections) {
    const k = infectiousNeighboursAtStart(sim, e.target, day)
    if (k > bestK) {
      bestK = k
      example = { target: e.target, k, p: 1 - Math.pow(1 - sim.config.beta, k), infected: true }
    }
  }

  return {
    day,
    phase,
    newInfections,
    recoveries,
    isolatedToday,
    quarantinedToday,
    infectedNow: now.I,
    infectedBefore: before ? before.I : null,
    peakInfected,
    peakDay,
    topSpreader,
    example,
    initialCases: sim.initialInfected.map((id) => ({ id, degree: sim.graph.degree[id] })),
  }
}

/** The longest chain of transmission so far, from an initial case to the most recently infected descendant. */
export function longestChain(sim: Simulation): number[] {
  const gen = new Int32Array(sim.graph.n).fill(-1)
  for (const v of sim.initialInfected) gen[v] = 0
  let deepest = sim.initialInfected[0] ?? 0
  for (const e of sim.log) {
    gen[e.target] = gen[e.source] + 1
    if (gen[e.target] > gen[deepest]) deepest = e.target
  }
  const path = [deepest]
  while (sim.sourceOf[path[path.length - 1]] !== -1) path.push(sim.sourceOf[path[path.length - 1]])
  return path.reverse()
}

/** Contacts permanently unusable because of interventions: distanced edges plus edges touching a vaccinated person. */
export function cutContacts(sim: Simulation): { cut: number; total: number } {
  let cut = 0
  sim.graph.edges.forEach(([u, v], e) => {
    if (sim.edgeDistanced[e] || sim.vaccinated[u] || sim.vaccinated[v]) cut++
  })
  return { cut, total: sim.graph.edges.length }
}

/** Why the people who were never infected escaped. */
export function escapeBreakdown(sim: Simulation) {
  let susceptible = 0
  for (let v = 0; v < sim.graph.n; v++) if (sim.status[v] === 0) susceptible++
  const reachable = sim.status.reduce((a, s) => a + (s === I ? 1 : 0), 0)
  return { vaccinated: sim.vaccinatedTotal, stillSusceptible: susceptible, stillInfectious: reachable }
}
