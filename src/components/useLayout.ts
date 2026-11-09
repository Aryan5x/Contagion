import { useMemo } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import type { Graph } from '../engine'

const cache = new WeakMap<Graph, Float32Array>()

/**
 * Force-directed layout, computed once per graph and normalised to [-1, 1]. Purely cosmetic: positions
 * never influence the simulation. Weak x/y forces keep disconnected vertices on screen.
 */
export function computeLayout(g: Graph): Float32Array {
  const hit = cache.get(g)
  if (hit) return hit
  type N = SimulationNodeDatum & { id: number }
  const nodes: N[] = Array.from({ length: g.n }, (_, id) => ({ id }))
  const links: SimulationLinkDatum<N>[] = g.edges.map(([source, target]) => ({ source, target }))
  const sim = forceSimulation(nodes)
    .force('link', forceLink<N, SimulationLinkDatum<N>>(links).distance(22).strength(0.5))
    .force('charge', forceManyBody().strength(g.n > 400 ? -34 : -52).distanceMax(260))
    .force('x', forceX(0).strength(0.045))
    .force('y', forceY(0).strength(0.045))
    .force('collide', forceCollide(4.5))
    .force('center', forceCenter(0, 0))
    .stop()
  const ticks = g.n > 600 ? 220 : 360
  for (let i = 0; i < ticks; i++) sim.tick()
  let max = 1e-6
  for (const p of nodes) max = Math.max(max, Math.abs(p.x ?? 0), Math.abs(p.y ?? 0))
  const out = new Float32Array(g.n * 2)
  nodes.forEach((p, i) => {
    out[2 * i] = (p.x ?? 0) / max
    out[2 * i + 1] = (p.y ?? 0) / max
  })
  cache.set(g, out)
  return out
}

export function useLayout(g: Graph): Float32Array {
  return useMemo(() => computeLayout(g), [g])
}
