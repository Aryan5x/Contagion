import type { Graph } from './types'
import { buildGraph } from './graphGenerator'

export interface ComponentInfo {
  labels: Int32Array
  count: number
  sizes: number[]
}

export interface GraphStats {
  vertices: number
  edges: number
  avgDegree: number
  maxDegree: number
  minDegree: number
  density: number
  components: number
  largestComponent: number
  /** Count of vertices per degree, ascending. */
  degreeDistribution: Array<{ degree: number; count: number }>
  /** <k^2>, the second moment of the degree distribution. */
  secondMoment: number
  /** (<k^2> - <k>) / <k>: expected number of onward contacts reached through a random edge. */
  excessDegree: number
  clustering: number
  /** Mean shortest-path length inside the largest component (sampled BFS sources). */
  avgPathLength: number
}

/** Connected components via breadth-first search. */
export function connectedComponents(g: Graph): ComponentInfo {
  const labels = new Int32Array(g.n).fill(-1)
  const sizes: number[] = []
  const queue = new Int32Array(g.n)
  let count = 0
  for (let s = 0; s < g.n; s++) {
    if (labels[s] !== -1) continue
    let head = 0
    let tail = 0
    queue[tail++] = s
    labels[s] = count
    while (head < tail) {
      const u = queue[head++]
      for (const v of g.adjNodes[u]) {
        if (labels[v] === -1) {
          labels[v] = count
          queue[tail++] = v
        }
      }
    }
    sizes.push(tail)
    count++
  }
  return { labels, count, sizes }
}

/** Density = 2|E| / (|V|(|V|-1)). */
export function density(g: Graph): number {
  return g.n < 2 ? 0 : (2 * g.edges.length) / (g.n * (g.n - 1))
}

/** C_D(v) = deg(v) / (|V| - 1). */
export function degreeCentrality(g: Graph, v: number): number {
  return g.n < 2 ? 0 : g.degree[v] / (g.n - 1)
}

export function degreeDistribution(g: Graph): Array<{ degree: number; count: number }> {
  const counts = new Map<number, number>()
  for (let v = 0; v < g.n; v++) counts.set(g.degree[v], (counts.get(g.degree[v]) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([degree, count]) => ({ degree, count }))
}

/** Vertex ids ordered by degree (descending), ties broken by id. */
export function rankByDegree(g: Graph): number[] {
  return Array.from({ length: g.n }, (_, i) => i).sort((a, b) => g.degree[b] - g.degree[a] || a - b)
}

/** Adjacency matrix A with A[i][j] = 1 iff {i, j} is an edge. Optionally restricted to a vertex subset. */
export function adjacencyMatrix(g: Graph, nodes?: readonly number[]): number[][] {
  const ids = nodes ?? Array.from({ length: g.n }, (_, i) => i)
  const index = new Map(ids.map((id, i) => [id, i]))
  const m = ids.map(() => new Array<number>(ids.length).fill(0))
  ids.forEach((u, i) => {
    for (const v of g.adjNodes[u]) {
      const j = index.get(v)
      if (j !== undefined) m[i][j] = 1
    }
  })
  return m
}

export interface Traversal {
  /** Vertices in the order they were visited. */
  order: number[]
  /** parent[v] = vertex from which v was discovered, -1 for the root and unreached vertices. */
  parent: Int32Array
  /** BFS only: distance in edges from the root, -1 if unreached. */
  dist: Int32Array
}

const sortedNeighbours = (g: Graph, u: number) => [...g.adjNodes[u]].sort((a, b) => a - b)

/** Breadth-first search from `start`. Neighbours are explored in ascending id order. */
export function bfs(g: Graph, start: number): Traversal {
  const parent = new Int32Array(g.n).fill(-1)
  const dist = new Int32Array(g.n).fill(-1)
  const order: number[] = []
  dist[start] = 0
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]
    order.push(u)
    for (const v of sortedNeighbours(g, u)) {
      if (dist[v] === -1) {
        dist[v] = dist[u] + 1
        parent[v] = u
        queue.push(v)
      }
    }
  }
  return { order, parent, dist }
}

/** Depth-first search from `start`, equivalent to the recursive definition, ascending id order. */
export function dfs(g: Graph, start: number): Traversal {
  const parent = new Int32Array(g.n).fill(-1)
  const dist = new Int32Array(g.n).fill(-1)
  const seen = new Uint8Array(g.n)
  const order: number[] = []
  const stack: Array<{ v: number; nbrs: number[]; i: number }> = []
  seen[start] = 1
  dist[start] = 0
  order.push(start)
  stack.push({ v: start, nbrs: sortedNeighbours(g, start), i: 0 })
  while (stack.length) {
    const top = stack[stack.length - 1]
    if (top.i >= top.nbrs.length) {
      stack.pop()
      continue
    }
    const w = top.nbrs[top.i++]
    if (!seen[w]) {
      seen[w] = 1
      parent[w] = top.v
      dist[w] = dist[top.v] + 1
      order.push(w)
      stack.push({ v: w, nbrs: sortedNeighbours(g, w), i: 0 })
    }
  }
  return { order, parent, dist }
}

/** Shortest path (fewest edges) between a and b, or null if they lie in different components. */
export function shortestPath(g: Graph, a: number, b: number): number[] | null {
  if (a === b) return [a]
  const t = bfs(g, a)
  if (t.dist[b] === -1) return null
  const path = [b]
  while (path[path.length - 1] !== a) path.push(t.parent[path[path.length - 1]])
  return path.reverse()
}

/** Induced subgraph on the first `size` vertices reached by BFS from `root`. */
export function sampleNeighbourhood(g: Graph, root: number, size: number) {
  const nodes = bfs(g, root).order.slice(0, size)
  const index = new Map(nodes.map((v, i) => [v, i]))
  const edges: Array<[number, number]> = []
  for (const [u, v] of g.edges) {
    const a = index.get(u)
    const b = index.get(v)
    if (a !== undefined && b !== undefined) edges.push([a, b])
  }
  return { nodes, graph: buildGraph(nodes.length, edges) }
}

function averageClustering(g: Graph): number {
  const sets = g.adjNodes.map((a) => new Set(a))
  let sum = 0
  for (let u = 0; u < g.n; u++) {
    const nb = g.adjNodes[u]
    const k = nb.length
    if (k < 2) continue
    let links = 0
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (sets[nb[i]].has(nb[j])) links++
    sum += (2 * links) / (k * (k - 1))
  }
  return g.n ? sum / g.n : 0
}

function sampledPathLength(g: Graph, comps: ComponentInfo): number {
  if (g.n < 2) return 0
  const biggest = comps.sizes.indexOf(Math.max(...comps.sizes))
  const members: number[] = []
  for (let v = 0; v < g.n; v++) if (comps.labels[v] === biggest) members.push(v)
  if (members.length < 2) return 0
  const sources = Math.min(40, members.length)
  let total = 0
  let pairs = 0
  for (let i = 0; i < sources; i++) {
    const s = members[Math.floor((i * members.length) / sources)]
    const { dist } = bfs(g, s)
    for (const v of members) {
      if (v !== s) {
        total += dist[v]
        pairs++
      }
    }
  }
  return pairs ? total / pairs : 0
}

/** All headline network statistics, computed from the actual graph. */
export function graphStats(g: Graph): GraphStats {
  const comps = connectedComponents(g)
  let sum = 0
  let sumSq = 0
  let max = 0
  let min = Infinity
  for (let v = 0; v < g.n; v++) {
    const d = g.degree[v]
    sum += d
    sumSq += d * d
    if (d > max) max = d
    if (d < min) min = d
  }
  const avg = g.n ? sum / g.n : 0
  const second = g.n ? sumSq / g.n : 0
  return {
    vertices: g.n,
    edges: g.edges.length,
    avgDegree: avg,
    maxDegree: max,
    minDegree: g.n ? min : 0,
    density: density(g),
    components: comps.count,
    largestComponent: comps.sizes.length ? Math.max(...comps.sizes) : 0,
    degreeDistribution: degreeDistribution(g),
    secondMoment: second,
    excessDegree: avg > 0 ? (second - avg) / avg : 0,
    clustering: averageClustering(g),
    avgPathLength: sampledPathLength(g, comps),
  }
}

/**
 * Per-edge transmissibility of the discrete SIR process: the probability that an infected vertex
 * eventually transmits across one given edge during its (geometric) infectious period.
 * T = sum_{j>=1} gamma (1-gamma)^{j-1} (1 - (1-beta)^j) = beta / (beta + gamma - beta*gamma).
 */
export function transmissibility(beta: number, gamma: number): number {
  const denom = beta + gamma - beta * gamma
  return denom <= 0 ? 0 : beta / denom
}

/**
 * Network reproduction number (Newman 2002, bond percolation on a configuration-model network):
 * R0 ~ T * (<k^2> - <k>) / <k>. An outbreak can reach a macroscopic fraction only if R0 > 1.
 */
export function estimateR0(beta: number, gamma: number, stats: Pick<GraphStats, 'excessDegree'>): number {
  return transmissibility(beta, gamma) * stats.excessDegree
}
