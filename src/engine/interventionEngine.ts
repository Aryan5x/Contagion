import type { Graph, InterventionConfig, InterventionKey } from './types'
import { I, R } from './types'
import { rankByDegree } from './graphAnalysis'
import type { Rng } from './randomGenerator'

export const DEFAULT_INTERVENTIONS: InterventionConfig = {
  randomVax: { enabled: false, pct: 15 },
  targetedVax: { enabled: false, pct: 15 },
  distancing: { enabled: false, pct: 40, startDay: 0 },
  isolation: { enabled: false, delay: 2, duration: 7, detectProb: 0.8 },
  tracing: { enabled: false, depth: 1, coverage: 0.7, delay: 1, duration: 14 },
}

export const INTERVENTION_LABEL: Record<InterventionKey, string> = {
  randomVax: 'Random vaccination',
  targetedVax: 'Targeted vaccination',
  distancing: 'Social distancing',
  isolation: 'Isolation of detected cases',
  tracing: 'Contact tracing',
}

export const INTERVENTION_KEYS: InterventionKey[] = ['randomVax', 'targetedVax', 'distancing', 'isolation', 'tracing']

/** Copy of `base` where exactly the interventions in `enabled` are switched on (parameters are kept). */
export function withEnabled(base: InterventionConfig, enabled: readonly InterventionKey[]): InterventionConfig {
  const on = new Set(enabled)
  return {
    randomVax: { ...base.randomVax, enabled: on.has('randomVax') },
    targetedVax: { ...base.targetedVax, enabled: on.has('targetedVax') },
    distancing: { ...base.distancing, enabled: on.has('distancing') },
    isolation: { ...base.isolation, enabled: on.has('isolation') },
    tracing: { ...base.tracing, enabled: on.has('tracing') },
  }
}

/** Cases are detected (and isolated) when isolation is on, and also when contact tracing is on: tracing starts from detected cases. */
export function detectionActive(cfg: InterventionConfig): boolean {
  return cfg.isolation.enabled || cfg.tracing.enabled
}

export function enabledKeys(cfg: InterventionConfig): InterventionKey[] {
  return INTERVENTION_KEYS.filter((k) => cfg[k].enabled)
}

export function scenarioName(keys: readonly InterventionKey[]): string {
  if (keys.length === 0) return 'No intervention'
  return keys.map((k) => INTERVENTION_LABEL[k]).join(' + ')
}

const countFor = (pct: number, n: number) => Math.max(0, Math.min(n, Math.round((pct / 100) * n)))

/**
 * Targeted vaccination: the `count` eligible vertices of highest degree (equivalently, highest degree
 * centrality C_D = deg / (n-1)), ties broken by vertex id.
 */
export function selectTargetedVaccination(g: Graph, pct: number, eligible: (v: number) => boolean): number[] {
  const count = countFor(pct, g.n)
  return rankByDegree(g).filter(eligible).slice(0, count)
}

/** Random vaccination: a uniform random sample of eligible vertices. */
export function selectRandomVaccination(g: Graph, pct: number, eligible: (v: number) => boolean, rng: Rng): number[] {
  const pool: number[] = []
  for (let v = 0; v < g.n; v++) if (eligible(v)) pool.push(v)
  return rng.sampleFrom(pool, countFor(pct, g.n))
}

/** Social distancing: a uniform random subset of `pct` percent of the edges is deactivated. */
export function selectDistancedEdges(g: Graph, pct: number, rng: Rng): number[] {
  return rng.sample(g.edges.length, Math.round((pct / 100) * g.edges.length))
}

export interface IsolationState {
  status: Uint8Array
  infectionDay: Int32Array
  isolatedUntil: Int32Array
  isolationDay: Int32Array
}

/**
 * Detection and isolation, applied at the end of day `day`. An infected, not-yet-isolated vertex that has
 * been infected for at least `delay` days is detected with probability `detectProb` per day and then
 * isolated for `duration` days: all its edges are inactive for steps starting on days
 * day .. day + duration - 1. Afterwards it re-joins the network if it is still infectious; if it has
 * recovered in the meantime it simply stays recovered. Returns the vertices newly isolated.
 */
export function updateIsolation(
  state: IsolationState,
  cfg: InterventionConfig['isolation'],
  day: number,
  rng: Rng,
  active = cfg.enabled,
): number[] {
  const out: number[] = []
  if (!active) return out
  for (let v = 0; v < state.status.length; v++) {
    if (state.status[v] !== I || state.isolationDay[v] !== -1) continue
    if (day - state.infectionDay[v] < cfg.delay) continue
    if (rng.chance(cfg.detectProb)) {
      state.isolationDay[v] = day
      state.isolatedUntil[v] = day + cfg.duration
      out.push(v)
    }
  }
  return out
}

export interface TracingState {
  status: Uint8Array
  vaccinated: Uint8Array
  edgeDistanced: Uint8Array
  quarantineFrom: Int32Array
  quarantineUntil: Int32Array
}

/**
 * Contact tracing from one detected case, at the end of day `day`.
 *
 * Breadth-first search over the contact graph from `index`, at most `depth` hops. Each edge to an
 * unvisited neighbour is followed (the contact is found) with probability `coverage`; a contact that
 * is not found is not traced onwards, so coverage compounds with depth. Edges switched off by active
 * distancing are not contacts and are never followed. Everyone found who is still susceptible or
 * infected, and not already quarantined, is quarantined for steps starting on days
 * day + delay .. day + delay + duration - 1. Returns the people newly quarantined, in BFS order.
 */
export function traceContacts(
  g: Graph,
  state: TracingState,
  cfg: InterventionConfig['tracing'],
  index: number,
  day: number,
  distancingActive: boolean,
  rng: Rng,
): number[] {
  const out: number[] = []
  const from = day + cfg.delay
  const until = from + cfg.duration
  const seen = new Set<number>([index])
  let frontier = [index]
  for (let hop = 0; hop < cfg.depth && frontier.length; hop++) {
    const next: number[] = []
    for (const u of frontier) {
      const nodes = g.adjNodes[u]
      const edges = g.adjEdges[u]
      for (let i = 0; i < nodes.length; i++) {
        const v = nodes[i]
        if (seen.has(v)) continue
        if (distancingActive && state.edgeDistanced[edges[i]]) continue
        if (!rng.chance(cfg.coverage)) continue
        seen.add(v)
        next.push(v)
        if (state.vaccinated[v] || state.status[v] === R) continue
        if (state.quarantineUntil[v] > day) continue // already in, or waiting for, a quarantine
        state.quarantineFrom[v] = from
        state.quarantineUntil[v] = until
        out.push(v)
      }
    }
    frontier = next
  }
  return out
}
