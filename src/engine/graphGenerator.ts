import { Rng, hashSeed } from './randomGenerator'
import type { Graph, NetworkSpec } from './types'

const key = (u: number, v: number, n: number) => (u < v ? u * n + v : v * n + u)

/** Builds the adjacency structure from a list of unique undirected edges. */
export function buildGraph(n: number, rawEdges: Array<readonly [number, number]>): Graph {
  const edges = rawEdges.map(([a, b]) => (a < b ? ([a, b] as const) : ([b, a] as const)))
  const adjNodes: number[][] = Array.from({ length: n }, () => [])
  const adjEdges: number[][] = Array.from({ length: n }, () => [])
  const degree = new Int32Array(n)
  edges.forEach(([u, v], id) => {
    adjNodes[u].push(v)
    adjEdges[u].push(id)
    adjNodes[v].push(u)
    adjEdges[v].push(id)
    degree[u]++
    degree[v]++
  })
  return { n, edges, adjNodes, adjEdges, degree }
}

/** Erdős–Rényi G(n, p): each of the C(n,2) pairs is an edge independently with probability p. */
export function erdosRenyi(n: number, p: number, rng: Rng): Graph {
  const edges: Array<[number, number]> = []
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      if (rng.chance(p)) edges.push([u, v])
    }
  }
  return buildGraph(n, edges)
}

/**
 * Watts–Strogatz: ring lattice where each vertex links to its k/2 nearest neighbours on each side;
 * every lattice edge then has its far end rewired with probability beta to a uniformly random vertex
 * (no self-loops, no duplicate edges).
 */
export function wattsStrogatz(n: number, k: number, beta: number, rng: Rng): Graph {
  const half = Math.max(1, Math.min(Math.floor(k / 2), Math.floor((n - 1) / 2)))
  const present = new Set<number>()
  const edges: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= half; j++) {
      const t = (i + j) % n
      present.add(key(i, t, n))
      edges.push([i, t])
    }
  }
  const nbrCount = new Int32Array(n)
  edges.forEach(([a, b]) => {
    nbrCount[a]++
    nbrCount[b]++
  })
  for (let e = 0; e < edges.length; e++) {
    if (!rng.chance(beta)) continue
    const [i, old] = edges[e]
    if (nbrCount[i] >= n - 1) continue
    let w = rng.int(n)
    let guard = 0
    while ((w === i || present.has(key(i, w, n))) && guard++ < 10 * n) w = rng.int(n)
    if (w === i || present.has(key(i, w, n))) continue
    present.delete(key(i, old, n))
    present.add(key(i, w, n))
    nbrCount[old]--
    nbrCount[w]++
    edges[e] = [i, w]
  }
  return buildGraph(n, edges)
}

/**
 * Barabási–Albert preferential attachment. Start from a clique of m+1 vertices; each new vertex
 * attaches to m distinct existing vertices chosen with probability proportional to their degree.
 * Sampling uniformly from the list of edge endpoints realises exactly that distribution.
 */
export function barabasiAlbert(n: number, m: number, rng: Rng): Graph {
  const mm = Math.max(1, Math.min(m, n - 1))
  const m0 = Math.min(n, mm + 1)
  const edges: Array<[number, number]> = []
  const endpoints: number[] = []
  for (let u = 0; u < m0; u++) {
    for (let v = u + 1; v < m0; v++) {
      edges.push([u, v])
      endpoints.push(u, v)
    }
  }
  for (let v = m0; v < n; v++) {
    const chosen = new Set<number>()
    while (chosen.size < mm) chosen.add(endpoints[rng.int(endpoints.length)])
    for (const t of chosen) {
      edges.push([t, v])
      endpoints.push(t, v)
    }
  }
  return buildGraph(n, edges)
}

export function validateSpec(spec: NetworkSpec): string | null {
  if (!Number.isInteger(spec.n) || spec.n < 2) return 'Population must be an integer of at least 2'
  if (!(spec.avgDegree > 0)) return 'Average degree must be positive'
  if (spec.avgDegree > spec.n - 1) return 'Average degree cannot exceed n - 1'
  if (spec.rewireP < 0 || spec.rewireP > 1) return 'Rewiring probability must be in [0, 1]'
  return null
}

export function generateGraph(spec: NetworkSpec): Graph {
  const err = validateSpec(spec)
  if (err) throw new Error(err)
  const rng = new Rng(hashSeed(spec.seed, 'graph', spec.type))
  switch (spec.type) {
    case 'er':
      return erdosRenyi(spec.n, Math.min(1, spec.avgDegree / (spec.n - 1)), rng)
    case 'ws':
      return wattsStrogatz(spec.n, 2 * Math.round(spec.avgDegree / 2), spec.rewireP, rng)
    case 'ba':
      return barabasiAlbert(spec.n, Math.max(1, Math.round(spec.avgDegree / 2)), rng)
  }
}

export const NETWORK_LABEL: Record<NetworkSpec['type'], string> = {
  er: 'Random (Erdős–Rényi)',
  ws: 'Small-world (Watts–Strogatz)',
  ba: 'Scale-free (Barabási–Albert)',
}

export const NETWORK_SHORT: Record<NetworkSpec['type'], string> = {
  er: 'Random',
  ws: 'Small-world',
  ba: 'Scale-free',
}
