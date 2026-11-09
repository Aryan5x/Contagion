import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERVENTIONS,
  Simulation,
  adjacencyMatrix,
  bfs,
  buildGraph,
  checkInvariants,
  computeMetrics,
  connectedComponents,
  density,
  dfs,
  generateGraph,
  graphStats,
  infectionProbability,
  percentReduction,
  runScenarios,
  PRESET_SCENARIOS,
  shortestPath,
  transmissibility,
  withEnabled,
} from '../src/engine'
import type { InterventionKey, NetworkType, SimConfig } from '../src/engine'

const cfg = (over: Partial<SimConfig> = {}, type: NetworkType = 'er', seed = 11, n = 200): SimConfig => ({
  network: { type, n, avgDegree: 6, rewireP: 0.1, seed },
  initialInfected: 3,
  beta: 0.15,
  gamma: 0.2,
  interventions: DEFAULT_INTERVENTIONS,
  maxDays: 365,
  ...over,
})
const iv = (keys: InterventionKey[]) => withEnabled(DEFAULT_INTERVENTIONS, keys)
const mk = (c: SimConfig, replicate = 0) => new Simulation(generateGraph(c.network), c, { replicate })

describe('graph generation', () => {
  for (const type of ['er', 'ws', 'ba'] as NetworkType[]) {
    it(`${type}: valid simple graph with consistent adjacency, matrix and degrees`, () => {
      const g = generateGraph({ type, n: 120, avgDegree: 6, rewireP: 0.2, seed: 3 })
      expect(g.n).toBe(120)
      const seen = new Set<string>()
      for (const [u, v] of g.edges) {
        expect(u).toBeLessThan(v) // no self-loops, stored once
        expect(u).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(120)
        const k = `${u}-${v}`
        expect(seen.has(k)).toBe(false) // no duplicate edges
        seen.add(k)
      }
      const A = adjacencyMatrix(g)
      let ones = 0
      for (let i = 0; i < g.n; i++) {
        expect(A[i][i]).toBe(0)
        let row = 0
        for (let j = 0; j < g.n; j++) {
          expect(A[i][j]).toBe(A[j][i]) // symmetric
          row += A[i][j]
        }
        expect(row).toBe(g.degree[i]) // row sum = degree
        ones += row
      }
      expect(ones).toBe(2 * g.edges.length)
      expect(Array.from(g.degree).reduce((a, b) => a + b, 0)).toBe(2 * g.edges.length) // handshake lemma
    })
  }

  it('is reproducible for a seed and different for another', () => {
    const a = generateGraph({ type: 'ba', n: 80, avgDegree: 4, rewireP: 0, seed: 5 })
    const b = generateGraph({ type: 'ba', n: 80, avgDegree: 4, rewireP: 0, seed: 5 })
    const c = generateGraph({ type: 'ba', n: 80, avgDegree: 4, rewireP: 0, seed: 6 })
    expect(a.edges).toEqual(b.edges)
    expect(a.edges).not.toEqual(c.edges)
  })

  it('Watts–Strogatz with no rewiring is a regular ring lattice; rewiring keeps the edge count', () => {
    const ring = generateGraph({ type: 'ws', n: 50, avgDegree: 4, rewireP: 0, seed: 1 })
    expect(Array.from(ring.degree).every((d) => d === 4)).toBe(true)
    const rw = generateGraph({ type: 'ws', n: 50, avgDegree: 4, rewireP: 0.5, seed: 1 })
    expect(rw.edges.length).toBe(ring.edges.length)
  })

  it('Barabási–Albert makes hubs and has average degree near 2m', () => {
    const g = generateGraph({ type: 'ba', n: 400, avgDegree: 6, rewireP: 0, seed: 2 })
    const s = graphStats(g)
    expect(s.avgDegree).toBeGreaterThan(5.5)
    expect(s.avgDegree).toBeLessThan(6.1)
    expect(s.maxDegree).toBeGreaterThan(4 * s.avgDegree)
    expect(s.components).toBe(1)
  })

  it('Erdős–Rényi average degree is close to the target', () => {
    const s = graphStats(generateGraph({ type: 'er', n: 500, avgDegree: 8, rewireP: 0, seed: 4 }))
    expect(Math.abs(s.avgDegree - 8)).toBeLessThan(0.6)
  })
})

describe('graph analysis', () => {
  const g = buildGraph(7, [
    [0, 1],
    [1, 2],
    [2, 0],
    [3, 4],
  ])
  it('degrees, density and components on a hand-built graph', () => {
    expect(Array.from(g.degree)).toEqual([2, 2, 2, 1, 1, 0, 0])
    expect(density(g)).toBeCloseTo((2 * 4) / (7 * 6))
    const c = connectedComponents(g)
    expect(c.count).toBe(4) // {0,1,2} {3,4} {5} {6}
    expect(c.sizes.slice().sort()).toEqual([1, 1, 2, 3])
    const s = graphStats(g)
    expect(s.edges).toBe(4)
    expect(s.maxDegree).toBe(2)
    expect(s.avgDegree).toBeCloseTo(8 / 7)
  })
  it('BFS, DFS and shortest path', () => {
    const path = buildGraph(6, [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 5],
      [4, 5],
    ])
    expect(bfs(path, 0).order).toEqual([0, 1, 2, 3, 4, 5])
    expect(dfs(path, 0).order).toEqual([0, 1, 3, 5, 4, 2])
    expect(shortestPath(path, 0, 5)!.length).toBe(4)
    expect(shortestPath(g, 0, 3)).toBeNull()
  })
  it('transmissibility matches its closed form and the geometric sum', () => {
    const b = 0.1
    const gm = 0.25
    let sum = 0
    for (let j = 1; j < 400; j++) sum += gm * (1 - gm) ** (j - 1) * (1 - (1 - b) ** j)
    expect(transmissibility(b, gm)).toBeCloseTo(sum, 6)
  })
})

describe('epidemic model', () => {
  it('beta = 0 produces no new infections', () => {
    const sim = mk(cfg({ beta: 0 })).runToEnd()
    expect(sim.log.length).toBe(0)
    expect(computeMetrics(sim).cumulativeInfections).toBe(3)
    expect(checkInvariants(sim)).toEqual([])
  })

  it('gamma = 1: everyone infected at the start of a step has recovered after it, and I ends at 0', () => {
    const sim = mk(cfg({ gamma: 1 }))
    const first = new Set(sim.initialInfected)
    sim.step()
    for (const v of first) expect(sim.status[v]).toBe(2)
    sim.runToEnd()
    expect(sim.counts.I).toBe(0)
    expect(sim.history.at(-1)!.I).toBe(0)
    expect(checkInvariants(sim)).toEqual([])
  })

  it('newly infected individuals do not transmit during the step they were infected', () => {
    // chain 0-1-2-3 with beta = 1, gamma = 0: infection should advance exactly one hop per day
    const g = buildGraph(4, [
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    const c = cfg({ beta: 1, gamma: 0, initialInfected: 1 })
    const sim = new Simulation(g, c)
    const start = sim.initialInfected[0]
    const hops = bfs(g, start).dist
    for (let d = 1; d <= 3; d++) {
      sim.step()
      for (let v = 0; v < 4; v++) {
        if (hops[v] <= d) expect(sim.infectionDay[v]).toBe(hops[v])
        else expect(sim.infectionDay[v]).toBe(-1)
      }
    }
  })

  it('a vertex cannot be infected twice and S+I+R = N at every step', () => {
    const sim = mk(cfg({ beta: 0.3 }, 'ba', 9)).runToEnd()
    const targets = sim.log.map((e) => e.target)
    expect(new Set(targets).size).toBe(targets.length)
    for (const h of sim.history) expect(h.S + h.I + h.R).toBe(200)
    expect(checkInvariants(sim)).toEqual([])
  })

  it('with no edges the infection cannot spread beyond the initially infected', () => {
    const g = buildGraph(50, [])
    const sim = new Simulation(g, cfg({ beta: 1 }, 'er', 1, 50)).runToEnd()
    expect(sim.log.length).toBe(0)
    expect(computeMetrics(sim).cumulativeInfections).toBe(3)
  })

  it('is reproducible for a seed', () => {
    const a = mk(cfg()).runToEnd()
    const b = mk(cfg()).runToEnd()
    expect(a.history).toEqual(b.history)
  })

  it('one-step infection frequency matches 1 - (1 - beta)^k', () => {
    // star: centre infected, k leaves... instead: one susceptible with k infected neighbours
    const k = 4
    const beta = 0.2
    const edges = Array.from({ length: k }, (_, i) => [0, i + 1] as [number, number])
    const g = buildGraph(k + 1, edges)
    let infected = 0
    let eligibleTrials = 0
    const trials = 20000
    for (let t = 0; t < trials; t++) {
      const c = cfg({ beta, gamma: 0, initialInfected: k }, 'er', t, k + 1)
      const sim = new Simulation(g, c)
      // force the infected set to be the k leaves (seed sampling picks k of k+1; skip draws where the centre is infected)
      if (sim.initialInfected.includes(0)) continue
      sim.step()
      if (sim.infectionDay[0] === 1) infected++
      eligibleTrials++
    }
    const freq = infected / eligibleTrials
    expect(freq).toBeGreaterThan(infectionProbability(beta, k) - 0.05)
    expect(freq).toBeLessThan(infectionProbability(beta, k) + 0.05)
  })
})

describe('interventions', () => {
  it('vaccinated individuals stay immune', () => {
    const c = cfg({ interventions: iv(['randomVax']), beta: 0.4 })
    const sim = mk(c).runToEnd()
    expect(sim.vaccinatedTotal).toBe(Math.round(0.15 * 200))
    for (let v = 0; v < 200; v++) {
      if (sim.vaccinated[v]) {
        expect(sim.infectionDay[v]).toBe(-1)
        expect(sim.status[v]).toBe(2)
      }
    }
    expect(checkInvariants(sim)).toEqual([])
  })

  it('targeted vaccination selects the highest-degree eligible nodes', () => {
    const c = cfg({ interventions: iv(['targetedVax']) }, 'ba', 8)
    const sim = mk(c)
    const g = sim.graph
    const minVax = Math.min(...[...Array(g.n).keys()].filter((v) => sim.vaccinated[v]).map((v) => g.degree[v]))
    const maxElig = Math.max(
      ...[...Array(g.n).keys()].filter((v) => !sim.vaccinated[v] && !sim.initialInfected.includes(v)).map((v) => g.degree[v]),
    )
    expect(sim.vaccinatedTotal).toBe(30)
    expect(minVax).toBeGreaterThanOrEqual(maxElig)
  })

  it('social distancing reduces the number of active edges and blocks transmission across them', () => {
    const c = cfg({ interventions: iv(['distancing']), beta: 0.5 }, 'er', 2)
    const sim = mk(c)
    const removed = sim.edgeDistanced.reduce((a, b) => a + b, 0)
    expect(removed).toBe(Math.round(0.4 * sim.graph.edges.length))
    sim.runToEnd()
    for (const e of sim.log) expect(sim.edgeDistanced[e.edge]).toBe(0)
    expect(checkInvariants(sim)).toEqual([])
  })

  it('isolated individuals do not transmit; recovered ones stay recovered', () => {
    const interventions = withEnabled(
      { ...DEFAULT_INTERVENTIONS, isolation: { enabled: true, delay: 0, duration: 5, detectProb: 1 } },
      ['isolation'],
    )
    const sim = mk(cfg({ interventions, beta: 0.5, gamma: 0.1 }, 'er', 5))
    // delay 0 and certain detection: the seeds are isolated on day 0
    for (const v of sim.initialInfected) expect(sim.isIsolated(v)).toBe(true)
    sim.runToEnd()
    expect(checkInvariants(sim)).toEqual([])
    for (let v = 0; v < sim.graph.n; v++) {
      if (sim.recoveryDay[v] !== -1) expect(sim.status[v]).toBe(2)
    }
    expect(sim.everIsolated).toBeGreaterThan(0)
  })

  it('isolation with a short duration lets still-infectious people return to the network', () => {
    const interventions = withEnabled(
      { ...DEFAULT_INTERVENTIONS, isolation: { enabled: true, delay: 0, duration: 2, detectProb: 1 } },
      ['isolation'],
    )
    const sim = mk(cfg({ interventions, beta: 0.5, gamma: 0.02, initialInfected: 1 }, 'er', 3))
    expect(sim.isIsolated(sim.initialInfected[0])).toBe(true)
    sim.step()
    sim.step()
    const v = sim.initialInfected[0]
    if (sim.status[v] === 1) expect(sim.isIsolated(v)).toBe(false) // back in the network
  })

  it('percentReduction handles a zero baseline and normal values', () => {
    expect(percentReduction(0, 0)).toBe(0)
    expect(percentReduction(0, 5)).toBe(0)
    expect(percentReduction(100, 25)).toBe(75)
    expect(percentReduction(50, 100)).toBe(-100)
  })

  it('comparison scenarios start from the same infected set and run independently', async () => {
    const c = cfg({ beta: 0.12 }, 'ba', 21)
    const g = generateGraph(c.network)
    const res = (await runScenarios(g, c, DEFAULT_INTERVENTIONS, PRESET_SCENARIOS, 4))!
    expect(res.length).toBe(PRESET_SCENARIOS.length)
    const base = res.find((r) => r.id === 'none')!
    for (const r of res) {
      expect(r.reference.initialInfected).toEqual(base.reference.initialInfected)
      expect(checkInvariants(r.reference)).toEqual([])
    }
    expect(base.reduction).toBe(0)
    const targeted = res.find((r) => r.id === 'targeted')!
    expect(targeted.stats.cumulative.mean).toBeLessThanOrEqual(base.stats.cumulative.mean)
    // the baseline never reports vaccinations or isolations
    expect(base.stats.vaccinated.mean).toBe(0)
    expect(base.stats.isolated.mean).toBe(0)
  })

  it('invariants hold across many random configurations', () => {
    const keysets: InterventionKey[][] = [[], ['randomVax'], ['targetedVax'], ['distancing'], ['isolation'], ['targetedVax', 'distancing', 'isolation'], ['tracing'], ['distancing', 'isolation', 'tracing']]
    let i = 0
    for (const type of ['er', 'ws', 'ba'] as NetworkType[]) {
      for (const keys of keysets) {
        const sim = mk(cfg({ interventions: iv(keys), beta: 0.1 + 0.05 * (i % 3), gamma: 0.1 + 0.05 * (i % 4) }, type, 100 + i++, 150)).runToEnd()
        expect(checkInvariants(sim)).toEqual([])
      }
    }
  })
})

describe('epidemic threshold', () => {
  it('thresholdBeta gives exactly R0 = 1, and null when no beta <= 1 can start an outbreak', async () => {
    const { thresholdBeta, estimateR0 } = await import('../src/engine')
    for (const [gamma, excess] of [[0.2, 6], [0.12, 9.5], [0.5, 2]] as const) {
      const b = thresholdBeta(gamma, excess)!
      expect(b).toBeGreaterThan(0)
      expect(estimateR0(b, gamma, { excessDegree: excess })).toBeCloseTo(1, 10)
    }
    expect(thresholdBeta(0.2, 0.5)).toBeNull() // too sparse: T would have to exceed 1
    expect(thresholdBeta(0.2, 0)).toBeNull()
  })
})
