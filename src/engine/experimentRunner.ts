import type { Graph, SimConfig, StepRecord } from './types'
import { Simulation } from './epidemicModel'
import { aggregateSeries, computeMetrics, mean, percentReduction, stdDev } from './metricsCalculator'
import { generateGraph } from './graphGenerator'
import { INTERVENTION_KEYS, scenarioName, withEnabled } from './interventionEngine'
import type { InterventionConfig, InterventionKey } from './types'

export interface RunSummary {
  cumulative: number
  peak: number
  peakDay: number
  attackRate: number
  recovered: number
  uninfected: number
  vaccinated: number
  isolated: number
  quarantined: number
  duration: number
}

export interface Agg {
  mean: number
  sd: number
}

export interface AggregateStats {
  runs: number
  cumulative: Agg
  peak: Agg
  peakDay: Agg
  attackRate: Agg
  recovered: Agg
  uninfected: Agg
  vaccinated: Agg
  isolated: Agg
  quarantined: Agg
  duration: Agg
  /** Share of runs in which more than 10% of the population was infected. */
  majorOutbreakPct: number
}

export interface Curve {
  day: number
  mean: number
  sd: number
}

export interface VariantResult {
  id: string
  label: string
  stats: AggregateStats
  /** Mean (and sd) of I(t), S(t), R(t) and new infections across runs. */
  curves: { I: Curve[]; S: Curve[]; R: Curve[]; newInfections: Curve[] }
  /** The first run (replicate 0), kept with per-day frames for replay. */
  reference: Simulation
  graph: Graph
  config: SimConfig
}

export function summarizeRun(sim: Simulation): RunSummary {
  const m = computeMetrics(sim)
  return {
    cumulative: m.cumulativeInfections,
    peak: m.peakInfected,
    peakDay: m.peakDay,
    attackRate: m.attackRate,
    recovered: m.recovered,
    uninfected: m.uninfected,
    vaccinated: m.vaccinated,
    isolated: m.totalIsolated,
    quarantined: m.totalQuarantined,
    duration: sim.day,
  }
}

const agg = (xs: number[]): Agg => ({ mean: mean(xs), sd: stdDev(xs) })

export function aggregateRuns(runs: RunSummary[]): AggregateStats {
  const pick = (f: keyof RunSummary) => agg(runs.map((r) => r[f]))
  return {
    runs: runs.length,
    cumulative: pick('cumulative'),
    peak: pick('peak'),
    peakDay: pick('peakDay'),
    attackRate: pick('attackRate'),
    recovered: pick('recovered'),
    uninfected: pick('uninfected'),
    vaccinated: pick('vaccinated'),
    isolated: pick('isolated'),
    quarantined: pick('quarantined'),
    duration: pick('duration'),
    majorOutbreakPct: runs.length ? (100 * runs.filter((r) => r.attackRate > 0.1).length) / runs.length : 0,
  }
}

export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export interface VariantSpec {
  id: string
  label: string
  config: SimConfig
  /** Reuse an already generated graph (comparison mode); otherwise it is generated from config.network. */
  graph?: Graph
}

/**
 * Runs one variant `runs` times. Replicates share the graph and the initially infected set and differ only
 * in the stochastic stream; replicate 0 is the canonical seeded run.
 */
export async function runVariant(
  spec: VariantSpec,
  runs: number,
  shouldCancel?: () => boolean,
): Promise<VariantResult | null> {
  const graph = spec.graph ?? generateGraph(spec.config.network)
  const summaries: RunSummary[] = []
  const histories: StepRecord[][] = []
  let reference: Simulation | null = null
  for (let r = 0; r < runs; r++) {
    const sim = new Simulation(graph, spec.config, { replicate: r, recordFrames: r === 0 }).runToEnd()
    if (r === 0) reference = sim
    summaries.push(summarizeRun(sim))
    histories.push(sim.history)
    if (r % 10 === 9) {
      await tick()
      if (shouldCancel?.()) return null
    }
  }
  const len = Math.max(...histories.map((h) => h.length))
  return {
    id: spec.id,
    label: spec.label,
    stats: aggregateRuns(summaries),
    curves: {
      I: aggregateSeries(histories, 'I', len),
      S: aggregateSeries(histories, 'S', len),
      R: aggregateSeries(histories, 'R', len),
      newInfections: aggregateSeries(histories, 'newInfections', len),
    },
    reference: reference as Simulation,
    graph,
    config: spec.config,
  }
}

export async function runVariants(
  specs: VariantSpec[],
  runs: number,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<VariantResult[] | null> {
  const out: VariantResult[] = []
  for (let i = 0; i < specs.length; i++) {
    onProgress?.(i, specs.length)
    await tick()
    if (shouldCancel?.()) return null
    const r = await runVariant(specs[i], runs, shouldCancel)
    if (!r) return null
    out.push(r)
  }
  onProgress?.(specs.length, specs.length)
  return out
}

// --- scenario comparison --------------------------------------------------------------------------

export interface ScenarioSpec {
  id: string
  keys: InterventionKey[]
}

export const PRESET_SCENARIOS: ScenarioSpec[] = [
  { id: 'none', keys: [] },
  { id: 'random', keys: ['randomVax'] },
  { id: 'targeted', keys: ['targetedVax'] },
  { id: 'distancing', keys: ['distancing'] },
  { id: 'isolation', keys: ['isolation'] },
  { id: 'tracing', keys: ['tracing'] },
]

export const scenarioId = (keys: readonly InterventionKey[]) =>
  keys.length ? INTERVENTION_KEYS.filter((k) => keys.includes(k)).join('+') : 'none'

export interface ScenarioResult extends VariantResult {
  keys: InterventionKey[]
  /** Reduction in mean cumulative infections versus the baseline, in percent. */
  reduction: number
}

/**
 * Runs every scenario on the SAME graph with the SAME seed (hence the same initially infected set). The
 * no-intervention baseline is always included because reductions are measured against it.
 */
export async function runScenarios(
  graph: Graph,
  base: SimConfig,
  interventions: InterventionConfig,
  scenarios: ScenarioSpec[],
  runs: number,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<ScenarioResult[] | null> {
  const list = scenarios.some((s) => s.keys.length === 0) ? scenarios : [{ id: 'none', keys: [] as InterventionKey[] }, ...scenarios]
  const specs: VariantSpec[] = list.map((s) => ({
    id: s.id,
    label: scenarioName(s.keys),
    graph,
    config: { ...base, interventions: withEnabled(interventions, s.keys) },
  }))
  const results = await runVariants(specs, runs, onProgress, shouldCancel)
  if (!results) return null
  const baseline = results.find((r) => r.id === 'none')?.stats.cumulative.mean ?? 0
  return results.map((r, i) => ({
    ...r,
    keys: list[i].keys,
    reduction: percentReduction(baseline, r.stats.cumulative.mean),
  }))
}
