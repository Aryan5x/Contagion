import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERVENTIONS,
  Simulation,
  cutContacts,
  explainDay,
  generateGraph,
  infectiousNeighboursAtStart,
  longestChain,
  withEnabled,
} from '../src/engine'
import type { SimConfig } from '../src/engine'

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  network: { type: 'ba', n: 150, avgDegree: 6, rewireP: 0.1, seed: 5 },
  initialInfected: 3,
  beta: 0.15,
  gamma: 0.15,
  interventions: DEFAULT_INTERVENTIONS,
  maxDays: 365,
  ...over,
})
const make = (c: SimConfig) => new Simulation(generateGraph(c.network), c)

describe('plain-language explanations match the simulation', () => {
  it('day report counts equal the history for every day', () => {
    const sim = make(cfg())
    while (sim.step()) {
      const r = explainDay(sim)
      const rec = sim.history[sim.history.length - 1]
      const prev = sim.history[sim.history.length - 2]
      expect(r.newInfections.length).toBe(rec.newInfections)
      expect(r.infectedNow).toBe(rec.I)
      expect(r.recoveries.length).toBe(prev.I + rec.newInfections - rec.I)
    }
  })

  it('worked example k is at least 1 and p follows 1 - (1 - beta)^k', () => {
    const sim = make(cfg())
    let seen = 0
    while (sim.step()) {
      const r = explainDay(sim)
      if (r.example) {
        seen++
        expect(r.example.k).toBeGreaterThanOrEqual(1)
        expect(r.example.p).toBeCloseTo(1 - Math.pow(1 - 0.15, r.example.k), 12)
        expect(sim.infectionDay[r.example.target]).toBe(sim.day)
        expect(infectiousNeighboursAtStart(sim, r.example.target, sim.day)).toBe(r.example.k)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('k respects distancing and isolation', () => {
    const c = cfg({ interventions: withEnabled(DEFAULT_INTERVENTIONS, ['distancing', 'isolation']), beta: 0.4 })
    const sim = make(c)
    while (sim.step()) {
      for (const e of sim.eventsOnDay(sim.day)) {
        expect(infectiousNeighboursAtStart(sim, e.target, sim.day)).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('longest chain is a valid path of real transmissions starting at an initial case', () => {
    const sim = make(cfg()).runToEnd()
    const path = longestChain(sim)
    expect(sim.initialInfected).toContain(path[0])
    for (let i = 1; i < path.length; i++) expect(sim.sourceOf[path[i]]).toBe(path[i - 1])
  })

  it('cut contacts count removed edges and edges of vaccinated people', () => {
    const sim = make(cfg({ interventions: withEnabled(DEFAULT_INTERVENTIONS, ['targetedVax', 'distancing']) }))
    const { cut, total } = cutContacts(sim)
    expect(total).toBe(sim.graph.edges.length)
    expect(cut).toBeGreaterThan(0)
    expect(cut).toBeLessThanOrEqual(total)
    expect(cutContacts(make(cfg())).cut).toBe(0)
  })

  it('phase is over exactly when nobody is infectious', () => {
    const sim = make(cfg()).runToEnd()
    expect(explainDay(sim).phase).toBe('over')
    expect(sim.counts.I).toBe(0)
  })
})
