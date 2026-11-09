import type { Graph, NodeView, SimConfig, StepRecord, TransmissionEvent } from './types'
import { CODE, I, R, S } from './types'
import { Rng, hashSeed } from './randomGenerator'
import { attemptTransmissions, drawRecoveries } from './transmissionEngine'
import {
  selectDistancedEdges,
  selectRandomVaccination,
  selectTargetedVaccination,
  updateIsolation,
} from './interventionEngine'

export interface SimulationOptions {
  /** Replicate index: changes the stochastic stream (transmission, recovery, vaccination draws)
   *  but never the graph or the initially infected set. */
  replicate?: number
  /** Keep a display-code snapshot of every day so past days can be replayed. */
  recordFrames?: boolean
}

/**
 * Discrete-time stochastic SIR on a fixed contact graph.
 *
 * This class is the single authoritative state of one scenario. All vertex attributes live in typed arrays
 * indexed by vertex id (see `getNode` for the per-vertex view).
 *
 * Time step (day d -> d+1), all decisions are made from the state at day d:
 *   1. every infectious, non-isolated vertex tries each active edge to a susceptible neighbour (Bernoulli beta);
 *   2. every infectious vertex recovers with probability gamma;
 *   3. both sets of changes are committed together, so new infections start transmitting only at day d+1 -> d+2;
 *   4. isolation (detection after a delay) is evaluated on the new state.
 */
export class Simulation {
  readonly graph: Graph
  readonly config: SimConfig
  readonly replicate: number

  day = 0
  readonly status: Uint8Array
  readonly infectionDay: Int32Array
  readonly recoveryDay: Int32Array
  readonly secondary: Int32Array
  readonly sourceOf: Int32Array
  readonly vaccinated: Uint8Array
  readonly isolatedUntil: Int32Array
  readonly isolationDay: Int32Array
  readonly edgeDistanced: Uint8Array
  readonly initialInfected: number[]

  readonly history: StepRecord[] = []
  readonly log: TransmissionEvent[] = []
  readonly frames: Uint8Array[] = []

  private cS: number
  private cI: number
  private cR: number
  private cumulative: number
  private vaccinatedCount = 0
  private distancedCount = 0
  private readonly rng: Rng
  private readonly isoRng: Rng
  private readonly recordFrames: boolean

  constructor(graph: Graph, config: SimConfig, opts: SimulationOptions = {}) {
    this.graph = graph
    this.config = config
    this.replicate = opts.replicate ?? 0
    this.recordFrames = opts.recordFrames ?? false
    const n = graph.n

    this.status = new Uint8Array(n) // all susceptible
    this.infectionDay = new Int32Array(n).fill(-1)
    this.recoveryDay = new Int32Array(n).fill(-1)
    this.secondary = new Int32Array(n)
    this.sourceOf = new Int32Array(n).fill(-1)
    this.vaccinated = new Uint8Array(n)
    this.isolatedUntil = new Int32Array(n).fill(-1)
    this.isolationDay = new Int32Array(n).fill(-1)
    this.edgeDistanced = new Uint8Array(graph.edges.length)

    const base = config.network.seed
    // Independent streams: the initial infected set depends only on the base seed, so every scenario
    // sharing a seed and a graph starts from exactly the same infected individuals.
    this.initialInfected = new Rng(hashSeed(base, 'seeds')).sample(n, Math.min(config.initialInfected, n))
    for (const v of this.initialInfected) {
      this.status[v] = I
      this.infectionDay[v] = 0
    }

    const iv = config.interventions
    const eligible = (v: number) => this.status[v] === S && !this.vaccinated[v]
    const vaxRng = new Rng(hashSeed(base, 'vax', this.replicate))
    const vaccinate = (list: number[]) => {
      for (const v of list) {
        if (this.status[v] !== S || this.vaccinated[v]) continue
        this.vaccinated[v] = 1
        this.status[v] = R // immune: removed from the susceptible pool before day 0
        this.vaccinatedCount++
      }
    }
    if (iv.targetedVax.enabled) vaccinate(selectTargetedVaccination(graph, iv.targetedVax.pct, eligible))
    if (iv.randomVax.enabled) vaccinate(selectRandomVaccination(graph, iv.randomVax.pct, eligible, vaxRng))
    if (iv.distancing.enabled) {
      const removed = selectDistancedEdges(graph, iv.distancing.pct, new Rng(hashSeed(base, 'dist', this.replicate)))
      for (const e of removed) this.edgeDistanced[e] = 1
      this.distancedCount = removed.length
    }

    this.rng = new Rng(hashSeed(base, 'sim', this.replicate))
    this.isoRng = new Rng(hashSeed(base, 'iso', this.replicate))

    this.cI = this.initialInfected.length
    this.cR = this.vaccinatedCount
    this.cS = n - this.cI - this.cR
    this.cumulative = this.cI
    // Isolation can already apply at day 0 when the detection delay is 0.
    updateIsolation(this, iv.isolation, 0, this.isoRng)
    this.record(0)
  }

  // --- queries -----------------------------------------------------------------------------------

  get counts() {
    return { S: this.cS, I: this.cI, R: this.cR, cumulative: this.cumulative }
  }
  get vaccinatedTotal() {
    return this.vaccinatedCount
  }
  get distancedEdgeCount() {
    return this.distancedCount
  }
  get distancingActive() {
    const d = this.config.interventions.distancing
    return d.enabled && this.day >= d.startDay
  }
  isFinished(): boolean {
    return this.cI === 0 || this.day >= this.config.maxDays
  }
  isIsolated(v: number): boolean {
    return this.status[v] === I && this.isolatedUntil[v] > this.day
  }
  /** Number of everyone who has ever been isolated. */
  get everIsolated(): number {
    let c = 0
    for (let v = 0; v < this.graph.n; v++) if (this.isolationDay[v] !== -1) c++
    return c
  }
  get currentlyIsolated(): number {
    let c = 0
    for (let v = 0; v < this.graph.n; v++) if (this.isIsolated(v)) c++
    return c
  }

  /** Display code per vertex, see CODE. */
  displayCodes(): Uint8Array {
    const out = new Uint8Array(this.graph.n)
    for (let v = 0; v < this.graph.n; v++) {
      if (this.vaccinated[v]) out[v] = CODE.VACCINATED
      else if (this.status[v] === S) out[v] = CODE.S
      else if (this.status[v] === R) out[v] = CODE.R
      else if (this.isolatedUntil[v] > this.day) out[v] = CODE.ISOLATED
      else if (this.day > 0 && this.infectionDay[v] === this.day) out[v] = CODE.NEW
      else out[v] = CODE.I
    }
    return out
  }

  getNode(v: number): NodeView {
    const g = this.graph
    return {
      id: v,
      status: this.status[v] === S ? 'S' : this.status[v] === I ? 'I' : 'R',
      degree: g.degree[v],
      centrality: g.n > 1 ? g.degree[v] / (g.n - 1) : 0,
      infectionDay: this.infectionDay[v] === -1 ? null : this.infectionDay[v],
      recoveryDay: this.recoveryDay[v] === -1 ? null : this.recoveryDay[v],
      secondaryInfections: this.secondary[v],
      source: this.sourceOf[v] === -1 ? null : this.sourceOf[v],
      vaccinated: this.vaccinated[v] === 1,
      isolated: this.isIsolated(v),
      isolationDay: this.isolationDay[v] === -1 ? null : this.isolationDay[v],
    }
  }

  /** Transmission events that happened on a given day. */
  eventsOnDay(day: number): TransmissionEvent[] {
    // The log is ordered by day, so scan backwards.
    const out: TransmissionEvent[] = []
    for (let i = this.log.length - 1; i >= 0 && this.log[i].day >= day; i--) {
      if (this.log[i].day === day) out.push(this.log[i])
    }
    return out
  }

  // --- dynamics ----------------------------------------------------------------------------------

  /** Advances one day. Returns false (and does nothing) if the epidemic is already over. */
  step(): boolean {
    if (this.isFinished()) return false
    const { graph, config } = this
    const d0 = this.day
    const d1 = d0 + 1

    const infectious: number[] = []
    for (let v = 0; v < graph.n; v++) if (this.status[v] === I) infectious.push(v)

    const events = attemptTransmissions(
      {
        graph,
        status: this.status,
        isolatedUntil: this.isolatedUntil,
        edgeDistanced: this.edgeDistanced,
        distancingActive: this.distancingActive,
        day: d0,
        beta: config.beta,
        rng: this.rng,
      },
      infectious,
    )
    const recovered = drawRecoveries(infectious, config.gamma, this.rng)

    // Commit simultaneously.
    for (const e of events) {
      this.status[e.target] = I
      this.infectionDay[e.target] = d1
      this.sourceOf[e.target] = e.source
      this.secondary[e.source]++
      this.log.push(e)
    }
    for (const v of recovered) {
      this.status[v] = R
      this.recoveryDay[v] = d1
      this.isolatedUntil[v] = -1
    }
    this.cS -= events.length
    this.cI += events.length - recovered.length
    this.cR += recovered.length
    this.cumulative += events.length
    this.day = d1

    updateIsolation(this, config.interventions.isolation, d1, this.isoRng)
    this.record(events.length)
    return true
  }

  /** Runs until the epidemic dies out (or maxDays). */
  runToEnd(): this {
    while (this.step());
    return this
  }

  private record(newInfections: number) {
    this.history.push({
      day: this.day,
      S: this.cS,
      I: this.cI,
      R: this.cR,
      newInfections,
      cumulative: this.cumulative,
      isolated: this.currentlyIsolated,
      recovered: this.cR - this.vaccinatedCount,
    })
    if (this.recordFrames) this.frames.push(this.displayCodes())
  }
}
