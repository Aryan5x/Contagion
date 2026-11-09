import type { Graph, TransmissionEvent } from './types'
import { S } from './types'
import type { Rng } from './randomGenerator'

/** P(infection in one step) for a susceptible vertex with k infectious neighbours: 1 - (1 - beta)^k. */
export function infectionProbability(beta: number, k: number): number {
  return 1 - Math.pow(1 - beta, k)
}

export interface TransmissionContext {
  graph: Graph
  status: Uint8Array
  /** Vertex u is isolated during a step iff isolatedUntil[u] > day (day = state at the start of the step). */
  isolatedUntil: Int32Array
  /** 1 where an edge has been removed by social distancing. */
  edgeDistanced: Uint8Array
  distancingActive: boolean
  /** Day at the start of this step; infections are stamped day + 1. */
  day: number
  beta: number
  rng: Rng
}

/**
 * One synchronous round of transmission attempts.
 *
 * Every infectious, non-isolated vertex u tries each active edge {u, v} whose far end v is susceptible,
 * with an independent Bernoulli(beta) trial. A susceptible vertex with k infectious neighbours is
 * therefore infected with probability 1 - (1 - beta)^k. Only vertices infectious at the START of the
 * step take part, so nothing infected during this step can transmit during it. The first successful
 * contact is recorded as the transmission source.
 */
export function attemptTransmissions(ctx: TransmissionContext, infectious: readonly number[]): TransmissionEvent[] {
  const { graph, status, isolatedUntil, edgeDistanced, distancingActive, day, beta, rng } = ctx
  const events: TransmissionEvent[] = []
  const claimed = new Set<number>()
  for (const u of infectious) {
    if (isolatedUntil[u] > day) continue
    const nodes = graph.adjNodes[u]
    const edges = graph.adjEdges[u]
    for (let i = 0; i < nodes.length; i++) {
      const v = nodes[i]
      if (status[v] !== S || claimed.has(v)) continue
      if (distancingActive && edgeDistanced[edges[i]]) continue
      if (rng.chance(beta)) {
        claimed.add(v)
        events.push({ day: day + 1, source: u, target: v, edge: edges[i] })
      }
    }
  }
  return events
}

/** Each infectious vertex recovers independently with probability gamma. */
export function drawRecoveries(infectious: readonly number[], gamma: number, rng: Rng): number[] {
  const out: number[] = []
  for (const u of infectious) if (rng.chance(gamma)) out.push(u)
  return out
}
