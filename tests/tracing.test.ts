import { describe, expect, it } from 'vitest'
import {
  CODE,
  DEFAULT_INTERVENTIONS,
  Rng,
  Simulation,
  buildGraph,
  checkInvariants,
  computeMetrics,
  generateGraph,
  traceContacts,
  withEnabled,
} from '../src/engine'
import type { InterventionConfig, SimConfig } from '../src/engine'

// A path 0 - 1 - 2 - 3 - 4 - 5, so hop distance from 0 is the vertex id.
const path = buildGraph(6, [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
])

const freshState = (n: number) => ({
  status: new Uint8Array(n),
  vaccinated: new Uint8Array(n),
  edgeDistanced: new Uint8Array(n),
  quarantineFrom: new Int32Array(n).fill(-1),
  quarantineUntil: new Int32Array(n).fill(-1),
})

const tracing = (over: Partial<InterventionConfig['tracing']> = {}): InterventionConfig['tracing'] => ({
  ...DEFAULT_INTERVENTIONS.tracing,
  enabled: true,
  coverage: 1,
  ...over,
})

describe('contact tracing (breadth-first search)', () => {
  it('finds exactly the contacts within `depth` hops', () => {
    for (const depth of [1, 2, 3]) {
      const st = freshState(6)
      const out = traceContacts(path, st, tracing({ depth }), 0, 0, false, new Rng(1))
      expect(out).toEqual(Array.from({ length: depth }, (_, i) => i + 1))
    }
  })

  it('quarantines from day + delay for `duration` days', () => {
    const st = freshState(6)
    traceContacts(path, st, tracing({ depth: 1, delay: 2, duration: 5 }), 0, 10, false, new Rng(1))
    expect(st.quarantineFrom[1]).toBe(12)
    expect(st.quarantineUntil[1]).toBe(17)
    expect(st.quarantineFrom[2]).toBe(-1)
  })

  it('does not follow distanced contacts, and skips recovered or vaccinated people but traces through them', () => {
    const st = freshState(6)
    st.edgeDistanced[2] = 1 // edge {2, 3}
    st.vaccinated[1] = 1
    const out = traceContacts(path, st, tracing({ depth: 5 }), 0, 0, true, new Rng(1))
    // 1 is found but immune (not quarantined); 2 is reached through 1; 3+ are behind the distanced edge.
    expect(out).toEqual([2])
  })

  it('with zero coverage nobody is found', () => {
    const st = freshState(6)
    expect(traceContacts(path, st, tracing({ coverage: 0, depth: 3 }), 0, 0, false, new Rng(1))).toEqual([])
  })

  it('does not restart a quarantine that is already running', () => {
    const st = freshState(6)
    traceContacts(path, st, tracing({ depth: 1, delay: 0, duration: 10 }), 0, 0, false, new Rng(1))
    const again = traceContacts(path, st, tracing({ depth: 1, delay: 0, duration: 10 }), 2, 3, false, new Rng(1))
    expect(again).toEqual([3]) // 1 is still in quarantine; 3 is new
    expect(st.quarantineFrom[1]).toBe(0)
  })
})

const cfg = (interventions: InterventionConfig, seed = 7): SimConfig => ({
  network: { type: 'ba', n: 300, avgDegree: 6, rewireP: 0, seed },
  initialInfected: 3,
  beta: 0.12,
  gamma: 0.12,
  interventions,
  maxDays: 365,
})

describe('contact tracing in the simulation', () => {
  const tracingOn = (over: Partial<InterventionConfig['tracing']> = {}) => ({
    ...withEnabled(DEFAULT_INTERVENTIONS, ['tracing']),
    isolation: { enabled: false, delay: 1, duration: 7, detectProb: 0.9 },
    tracing: tracing(over),
  })

  it('detects and isolates cases even with the isolation switch off, and keeps every invariant', () => {
    const sim = new Simulation(generateGraph(cfg(tracingOn()).network), cfg(tracingOn())).runToEnd()
    expect(sim.everIsolated).toBeGreaterThan(0)
    expect(sim.everQuarantined).toBeGreaterThan(0)
    expect(checkInvariants(sim)).toEqual([])
  })

  it('nobody in quarantine catches or passes on the infection', () => {
    const c = cfg(tracingOn({ depth: 2, delay: 0 }))
    const sim = new Simulation(generateGraph(c.network), c).runToEnd()
    for (const e of sim.log) {
      const d0 = e.day - 1
      for (const v of [e.source, e.target]) {
        const inQ = sim.quarantineFrom[v] !== -1 && sim.quarantineFrom[v] <= d0 && d0 < sim.quarantineUntil[v]
        expect(inQ).toBe(false)
      }
    }
  })

  it('quarantined susceptible people are shown with their own display code', () => {
    const c = cfg(tracingOn({ depth: 2, delay: 0, duration: 30 }))
    const sim = new Simulation(generateGraph(c.network), c)
    let seen = false
    while (!seen && sim.step()) seen = sim.displayCodes().includes(CODE.QUARANTINED)
    expect(seen).toBe(true)
  })

  it('leaves every other random draw unchanged: same infections as isolation alone before anyone is traced', () => {
    // With coverage 0 tracing finds nobody, so the epidemic must match isolation alone exactly.
    const isolationOnly = { ...DEFAULT_INTERVENTIONS, isolation: { enabled: true, delay: 1, duration: 7, detectProb: 0.9 } }
    const noOneFound = { ...isolationOnly, tracing: tracing({ coverage: 0 }) }
    const a = new Simulation(generateGraph(cfg(isolationOnly).network), cfg(isolationOnly)).runToEnd()
    const b = new Simulation(generateGraph(cfg(noOneFound).network), cfg(noOneFound)).runToEnd()
    expect(b.history.map((h) => h.cumulative)).toEqual(a.history.map((h) => h.cumulative))
  })

  it('on average, tracing on top of isolation infects fewer people than isolation alone', () => {
    const isolationOnly = { ...DEFAULT_INTERVENTIONS, isolation: { enabled: true, delay: 2, duration: 7, detectProb: 0.7 } }
    const plusTracing = { ...isolationOnly, tracing: tracing({ coverage: 0.9, depth: 1, delay: 0, duration: 14 }) }
    const g = generateGraph(cfg(isolationOnly).network)
    const meanInfected = (iv: InterventionConfig) => {
      let total = 0
      for (let r = 0; r < 30; r++) total += computeMetrics(new Simulation(g, cfg(iv), { replicate: r }).runToEnd()).cumulativeInfections
      return total / 30
    }
    expect(meanInfected(plusTracing)).toBeLessThan(meanInfected(isolationOnly))
  })
})
