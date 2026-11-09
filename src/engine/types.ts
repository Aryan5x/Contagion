/** Shared types for the simulation engine. The engine has no React or DOM dependency. */

export type NetworkType = 'er' | 'ws' | 'ba'

/** Undirected simple graph G = (V, E). Vertices are 0..n-1, edges are stored once with u < v. */
export interface Graph {
  readonly n: number
  readonly edges: ReadonlyArray<readonly [number, number]>
  /** adjNodes[u][i] is the i-th neighbour of u, adjEdges[u][i] the id of the connecting edge. */
  readonly adjNodes: ReadonlyArray<ReadonlyArray<number>>
  readonly adjEdges: ReadonlyArray<ReadonlyArray<number>>
  readonly degree: Int32Array
}

export interface NetworkSpec {
  type: NetworkType
  n: number
  /** Target average degree <k>. ER: p = <k>/(n-1). WS: k nearest neighbours. BA: m = <k>/2. */
  avgDegree: number
  /** Watts-Strogatz rewiring probability. Ignored by the other models. */
  rewireP: number
  seed: number
}

export interface InterventionConfig {
  randomVax: { enabled: boolean; pct: number }
  targetedVax: { enabled: boolean; pct: number }
  distancing: { enabled: boolean; pct: number; startDay: number }
  isolation: { enabled: boolean; delay: number; duration: number; detectProb: number }
  /**
   * Contact tracing. Uses the isolation settings to detect cases (and isolates them), then follows the
   * contact graph breadth-first from each detected case up to `depth` hops. Each contact is found with
   * probability `coverage`; found people are quarantined `delay` days after the detection, for
   * `duration` days. Only people who were found are traced onwards.
   */
  tracing: { enabled: boolean; depth: number; coverage: number; delay: number; duration: number }
}

export type InterventionKey = keyof InterventionConfig

export interface SimConfig {
  network: NetworkSpec
  initialInfected: number
  /** Transmission probability per active infected contact per step. */
  beta: number
  /** Recovery probability per infected individual per step. */
  gamma: number
  interventions: InterventionConfig
  /** Safety cap on simulated days. */
  maxDays: number
}

/** Compartments. Vaccinated individuals are immune and are counted in R (flagged separately). */
export const S = 0
export const I = 1
export const R = 2

/** Display codes used by the renderer. */
export const CODE = {
  S: 0,
  I: 1,
  R: 2,
  ISOLATED: 3,
  NEW: 4,
  VACCINATED: 5,
  /** Susceptible and in quarantine after being traced: cannot be infected while it lasts. */
  QUARANTINED: 6,
} as const

export interface TransmissionEvent {
  /** Day on which the infection was acquired. */
  day: number
  source: number
  target: number
  edge: number
}

export interface StepRecord {
  day: number
  S: number
  I: number
  R: number
  newInfections: number
  cumulative: number
  /** Currently isolated infected individuals at the end of this day. */
  isolated: number
  /** People in quarantine after contact tracing at the end of this day (any state). */
  quarantined: number
  /** Naturally recovered (R minus vaccinated). */
  recovered: number
}

export interface NodeView {
  id: number
  status: 'S' | 'I' | 'R'
  degree: number
  centrality: number
  infectionDay: number | null
  recoveryDay: number | null
  secondaryInfections: number
  source: number | null
  vaccinated: boolean
  isolated: boolean
  isolationDay: number | null
  quarantined: boolean
  /** Day the quarantine started (tracing day + tracing delay), if this person was ever traced. */
  quarantineDay: number | null
}

export interface Metrics {
  day: number
  population: number
  susceptible: number
  infected: number
  removed: number
  recovered: number
  vaccinated: number
  cumulativeInfections: number
  uninfected: number
  peakInfected: number
  peakDay: number
  attackRate: number
  totalIsolated: number
  currentlyIsolated: number
  totalQuarantined: number
  currentlyQuarantined: number
  /** Mean secondary infections of recovered cases that were infected within the first few days. */
  observedR: number | null
  finished: boolean
}
