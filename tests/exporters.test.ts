import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERVENTIONS,
  PRESET_SCENARIOS,
  Simulation,
  buildGraph,
  configSlug,
  csvCell,
  curvesCSV,
  edgeListCSV,
  generateGraph,
  historyCSV,
  parametersCSV,
  runScenarios,
  toCSV,
  transmissionsCSV,
  variantsCSV,
  withEnabled,
} from '../src/engine'
import type { SimConfig } from '../src/engine'

const lines = (csv: string) => csv.trimEnd().split('\r\n')
const cfg: SimConfig = {
  network: { type: 'ba', n: 120, avgDegree: 4, rewireP: 0, seed: 5 },
  initialInfected: 2,
  beta: 0.15,
  gamma: 0.15,
  interventions: withEnabled(DEFAULT_INTERVENTIONS, ['tracing']),
  maxDays: 365,
}

describe('CSV encoding', () => {
  it('quotes only fields that need it and doubles quotes', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(1 / 3)).toBe('0.333333')
    expect(csvCell(true)).toBe('true')
  })

  it('writes a header and CRLF-terminated rows', () => {
    expect(toCSV(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"\r\n')
  })

  it('names files after the network and seed', () => {
    expect(configSlug(cfg)).toBe('scale-free-n120-k4-seed5')
  })
})

describe('simulation exports', () => {
  const sim = new Simulation(generateGraph(cfg.network), cfg).runToEnd()

  it('daily counts: one row per day, matching the simulation history', () => {
    const rows = lines(historyCSV(sim))
    expect(rows[0]).toBe('day,susceptible,infected,removed,recovered,vaccinated,new_infections,cumulative_infections,isolated,quarantined')
    expect(rows.length).toBe(sim.history.length + 1)
    const last = rows[rows.length - 1].split(',').map(Number)
    const h = sim.history[sim.history.length - 1]
    expect(last).toEqual([h.day, h.S, h.I, h.R, h.recovered, sim.vaccinatedTotal, h.newInfections, h.cumulative, h.isolated, h.quarantined])
  })

  it('transmissions: every initial case and every logged infection', () => {
    const rows = lines(transmissionsCSV(sim))
    expect(rows.length).toBe(1 + sim.initialInfected.length + sim.log.length)
    expect(rows[1]).toBe(`0,,${sim.initialInfected[0]},,initial case`)
  })

  it('parameters: include every intervention setting, tracing too', () => {
    const csv = parametersCSV(cfg)
    expect(csv).toContain('seed,5\r\n')
    expect(csv).toContain('tracing.enabled,true\r\n')
    expect(csv).toContain(`tracing.depth,${cfg.interventions.tracing.depth}\r\n`)
  })

  it('edge list: one row per edge with u < v', () => {
    const g = buildGraph(3, [
      [0, 1],
      [2, 1],
    ])
    expect(lines(edgeListCSV(g))).toEqual(['edge,u,v,degree_u,degree_v', '0,0,1,1,2', '1,1,2,2,1'])
  })
})

describe('comparison exports', () => {
  it('results table has one row per scenario and a reduction column', async () => {
    const g = generateGraph(cfg.network)
    const res = (await runScenarios(g, cfg, DEFAULT_INTERVENTIONS, PRESET_SCENARIOS, 2))!
    const rows = lines(variantsCSV(res))
    expect(rows.length).toBe(res.length + 1)
    const header = rows[0].split(',')
    expect(header).toContain('reduction_pct')
    expect(header).toContain('quarantined_mean')
    const baseline = rows.find((r) => r.startsWith('none,'))!.split(',')
    expect(Number(baseline[header.indexOf('reduction_pct')])).toBe(0)

    const curves = lines(curvesCSV(res))
    const expected = res.reduce((a, r) => a + Math.max(r.curves.I.length, r.curves.S.length, r.curves.R.length), 0)
    expect(curves.length).toBe(expected + 1)
  })
})
