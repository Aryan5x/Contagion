import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Simulation,
  adjacencyMatrix,
  bfs,
  connectedComponents,
  degreeCentrality,
  dfs,
  rankByDegree,
  sampleNeighbourhood,
  shortestPath,
  transmissibility,
} from '../engine'
import { useWorkspace } from '../state/workspace'
import { NetworkCanvas } from '../components/NetworkCanvas'
import { Btn, Formula, M, NumberField, SliderField, Segmented, cx } from '../components/ui'
import { COLORS } from '../theme'

const TOC = [
  ['fundamentals', 'Graph fundamentals'],
  ['adjacency', 'Adjacency matrix'],
  ['centrality', 'Degree centrality'],
  ['connectivity', 'Connectivity and components'],
  ['traversal', 'BFS and DFS'],
  ['paths', 'Shortest paths'],
  ['sir', 'Discrete-time SIR'],
  ['modify', 'Interventions as graph edits'],
] as const

function Concept({
  id,
  title,
  definition,
  math,
  relevance,
  children,
}: {
  id: string
  title: string
  definition: ReactNode
  math: ReactNode
  relevance: ReactNode
  children?: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-[26px] leading-8 tracking-[-0.01em]">{title}</h2>
      <div className="mt-4 grid gap-x-10 gap-y-4 lg:grid-cols-3">
        <div>
          <h3 className="mb-1 text-[13px] text-ink3">Definition</h3>
          <div className="space-y-2 text-[14px] leading-6 text-ink2">{definition}</div>
        </div>
        <div>
          <h3 className="mb-1 text-[13px] text-ink3">Mathematical representation</h3>
          <div className="text-[14px] leading-6 text-ink2">{math}</div>
        </div>
        <div>
          <h3 className="mb-1 text-[13px] text-ink3">Why it matters for epidemics</h3>
          <div className="space-y-2 text-[14px] leading-6 text-ink2">{relevance}</div>
        </div>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  )
}

function Demo({ children, title, aside }: { children: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium">{title}</h3>
        {aside && <div className="text-[13px] text-ink3">{aside}</div>}
      </div>
      {children}
    </div>
  )
}

export function Concepts() {
  const w = useWorkspace()
  const { graph, config, stats } = w

  // ---- sample neighbourhood used by the matrix and traversal demos ----
  const hubs = useMemo(() => rankByDegree(graph), [graph])
  const [root, setRoot] = useState(hubs[0] ?? 0)
  const [sampleSize, setSampleSize] = useState(10)
  useEffect(() => setRoot(hubs[0] ?? 0), [hubs])
  const rootId = Math.min(Math.max(0, Math.round(root)), graph.n - 1)
  const sample = useMemo(() => sampleNeighbourhood(graph, rootId, sampleSize), [graph, rootId, sampleSize])
  const matrix = useMemo(() => adjacencyMatrix(sample.graph), [sample])

  // ---- traversal ----
  const [algo, setAlgo] = useState<'bfs' | 'dfs'>('bfs')
  const [stepN, setStepN] = useState(1)
  const trace = useMemo(() => (algo === 'bfs' ? bfs(sample.graph, 0) : dfs(sample.graph, 0)), [algo, sample])
  useEffect(() => setStepN(1), [algo, sample])
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setStepN((s) => {
        if (s >= trace.order.length) {
          setPlaying(false)
          return s
        }
        return s + 1
      })
    }, 650)
    return () => window.clearInterval(id)
  }, [playing, trace])

  // ---- components ----
  const comps = useMemo(() => connectedComponents(graph), [graph])
  const full = useMemo(() => new Simulation(graph, config), [graph, config])
  const reach = useMemo(() => {
    const seeds = new Set(full.initialInfected.map((v) => comps.labels[v]))
    return comps.sizes.reduce((a, s, i) => a + (seeds.has(i) ? s : 0), 0)
  }, [full, comps])
  const finished = useMemo(() => new Simulation(graph, config).runToEnd(), [graph, config])

  // ---- shortest path ----
  const [a, setA] = useState(0)
  const [b, setB] = useState(Math.min(graph.n - 1, 17))
  const A = Math.min(Math.max(0, Math.round(a)), graph.n - 1)
  const B = Math.min(Math.max(0, Math.round(b)), graph.n - 1)
  const route = useMemo(() => shortestPath(graph, A, B), [graph, A, B])
  const edgeId = useMemo(() => {
    const m = new Map<string, number>()
    graph.edges.forEach(([u, v], i) => m.set(`${u}-${v}`, i))
    return (u: number, v: number) => m.get(u < v ? `${u}-${v}` : `${v}-${u}`) ?? -1
  }, [graph])
  const possibleEdges = useMemo(() => (route ? route.slice(1).map((v, i) => edgeId(route[i], v)) : []), [route, edgeId])
  const actual = useMemo(() => {
    if (finished.infectionDay[B] === -1) return null
    const chain = [B]
    while (finished.sourceOf[chain[chain.length - 1]] !== -1) chain.push(finished.sourceOf[chain[chain.length - 1]])
    chain.reverse()
    return { chain, edges: chain.slice(1).map((v, i) => edgeId(chain[i], v)) }
  }, [finished, B, edgeId])
  const noCodes = useMemo(() => new Uint8Array(graph.n), [graph])

  const T = transmissibility(config.beta, config.gamma)
  const top = hubs.slice(0, 5)

  return (
    <div>
      <header className="rise mb-8 max-w-3xl">
        <h1 className="font-serif text-[34px] leading-[1.15] font-normal tracking-[-0.02em]">Mathematical concepts</h1>
        <p className="mt-2 text-[15px] leading-[22px] text-ink2">
          The simulator is built on a handful of discrete-mathematics ideas. Each is stated, written in symbols and tied back to epidemic spread. The examples below use the network you generated, not canned data.
        </p>
      </header>

      <div className="grid gap-10 xl:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden xl:block">
          <ul className="sticky top-0 space-y-0.5 text-[13px]">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }} className="block rounded-md px-2 py-1.5 text-ink3 transition-colors duration-150 hover:bg-raised hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="rise-2 min-w-0 space-y-10">
          <Concept
            id="fundamentals"
            title="Graph fundamentals"
            definition={
              <>
                <p>A graph <M>G = (V, E)</M> has a set of vertices (here, individuals) and a set of edges (possible contacts). In an undirected graph an edge {'{u, v}'} has no direction: if u can infect v then v can infect u.</p>
                <p>The degree of a vertex counts its edges. The degree distribution gives, for every k, how many vertices have degree k. A graph is connected if a path joins every pair of vertices; otherwise it splits into connected components.</p>
              </>
            }
            math={
              <>
                <Formula>
                  deg(v) = |{'{u : {u, v} ∈ E}'}|{'\n'}Σ deg(v) = 2|E|{'\n'}⟨k⟩ = 2|E| / |V|
                </Formula>
                <p>A weighted graph adds a weight <M>w(u, v)</M> to each edge, for example contact intensity. This simulator uses an unweighted graph: every active edge has the same transmission probability β.</p>
              </>
            }
            relevance={
              <>
                <p>Vertices and edges turn "who meets whom" into something you can compute. Epidemic outcomes depend on the structure of those contacts as much as on the disease.</p>
                <p>Current network: <M>|V| = {stats.vertices}</M>, <M>|E| = {stats.edges}</M>, <M>⟨k⟩ = {stats.avgDegree.toFixed(2)}</M>, <M>max deg = {stats.maxDegree}</M>.</p>
              </>
            }
          />

          <Concept
            id="adjacency"
            title="Adjacency matrix"
            definition={<p>A square table with one row and one column per vertex. The entry in row i and column j is 1 if i and j are connected and 0 otherwise. For an undirected graph the matrix is symmetric, and the diagonal is 0 because there are no self-loops.</p>}
            math={
              <Formula>
                A<sub>ij</sub> = 1 if {'{i, j}'} ∈ E, else 0{'\n'}row sum = deg(i){'\n'}A = Aᵀ
              </Formula>
            }
            relevance={<p>Row sums are degrees, so the matrix lists every potential transmission route at once. Powers of A count walks: (A²)<sub>ij</sub> is the number of two-step contact chains from i to j.</p>}
          >
            <Demo title="Adjacency matrix of a sample" aside={`${sample.nodes.length} of ${graph.n} individuals`}>
              <div className="mb-4 grid max-w-xl gap-x-8 sm:grid-cols-2">
                <SliderField label="Sample size" value={sampleSize} min={5} max={14} step={1} onChange={setSampleSize} hint="The sample is the first individuals reached by a breadth-first search from the chosen start, so the sample is connected." />
                <NumberField label="Start individual" value={rootId} min={0} max={graph.n - 1} onChange={setRoot} hint="Defaults to the highest-degree individual." />
              </div>
              <div className="overflow-x-auto">
                <table className="tnum border-separate border-spacing-0.5 font-mono text-[12px]">
                  <thead>
                    <tr>
                      <th className="size-8" />
                      {sample.nodes.map((id) => (
                        <th key={id} className="size-8 text-center font-normal text-ink3">{id}</th>
                      ))}
                      <th className="px-2 text-center font-normal text-ink3">deg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, i) => (
                      <tr key={i}>
                        <th className="pr-2 text-right font-normal text-ink3">{sample.nodes[i]}</th>
                        {row.map((x, j) => (
                          <td key={j} className={cx('size-8 rounded-md text-center', i === j ? 'bg-bg text-ink3' : x ? 'bg-chalk text-[#17150f]' : 'bg-bg text-ink3')}>{x}</td>
                        ))}
                        <td className="px-2 text-center text-ink2">{row.reduce((s, x) => s + x, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[13px] text-ink3">Rows and columns are labelled with the individuals' real ids. Row sums here count contacts inside the sample only.</p>
            </Demo>
          </Concept>

          <Concept
            id="centrality"
            title="Degree centrality"
            definition={<p>A measure of how connected a vertex is, scaled to the largest degree it could have. A vertex linked to everybody scores 1, an isolated vertex scores 0.</p>}
            math={<Formula>C_D(v) = deg(v) / (|V| − 1)</Formula>}
            relevance={<p>More contacts means more chances to catch the infection and more chances to pass it on. Ranking vertices by C_D finds the individuals whose removal cuts the most routes, which is exactly what targeted vaccination exploits.</p>}
          >
            <Demo title="Highest degree centrality in this network">
              <table className="w-full max-w-lg text-[13px]">
                <thead className="text-ink3">
                  <tr>
                    <th className="py-1 text-left font-normal">Individual</th>
                    <th className="py-1 text-right font-normal">deg(v)</th>
                    <th className="py-1 text-right font-normal">C_D(v)</th>
                  </tr>
                </thead>
                <tbody className="tnum font-mono">
                  {top.map((v) => (
                    <tr key={v} className="border-t border-line">
                      <td className="py-1.5 text-ink">{v}</td>
                      <td className="py-1.5 text-right text-ink2">{graph.degree[v]}</td>
                      <td className="py-1.5 text-right text-ink">{graph.degree[v]} / {graph.n - 1} = {degreeCentrality(graph, v).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Demo>
          </Concept>

          <Concept
            id="connectivity"
            title="Connectivity and components"
            definition={<p>A connected component is a maximal set of vertices that can all reach one another. Infection spreads only along edges, so it can never leave the component it started in.</p>}
            math={<Formula>u ~ v ⇔ a path joins u and v{'\n'}max outbreak ≤ Σ |C| over components C containing an initial case</Formula>}
            relevance={
              <>
                <p>Fragmenting a network into many small components is a strategy in itself: distancing and vaccination work partly by cutting the graph apart.</p>
                <p>
                  This network has <M>{comps.count}</M> component{comps.count === 1 ? '' : 's'}; the largest holds <M>{stats.largestComponent}</M> of <M>{graph.n}</M>. With the current initial cases, at most <M>{reach}</M> individuals ({((100 * reach) / graph.n).toFixed(0)}%) can ever be reached before any intervention.
                </p>
              </>
            }
          />

          <Concept
            id="traversal"
            title="Breadth-first and depth-first search"
            definition={
              <>
                <p>Both visit every vertex reachable from a start vertex, and so find connected components. BFS explores in rings: all neighbours, then neighbours of neighbours. DFS goes as deep as it can along one branch, then backtracks.</p>
              </>
            }
            math={<Formula>BFS: queue (first in, first out){'\n'}DFS: stack (last in, first out){'\n'}time O(|V| + |E|)</Formula>}
            relevance={<p>BFS rings are the days of an unstoppable epidemic: a vertex at distance d can be infected no sooner than day d. The same BFS counts components and finds shortest contact chains.</p>}
          >
            <Demo title="Traversal on the sample graph" aside={`visited ${Math.min(stepN, trace.order.length)} of ${trace.order.length}`}>
              <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
                <TraversalSvg sample={sample} order={trace.order} parent={trace.parent} step={stepN} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented value={algo} onChange={setAlgo} label="Algorithm" size="sm" options={[{ value: 'bfs', label: 'Breadth-first' }, { value: 'dfs', label: 'Depth-first' }]} />
                    <Btn size="sm" onClick={() => { if (stepN >= trace.order.length) setStepN(1); setPlaying((p) => !p) }}>{playing ? 'Pause' : 'Play'}</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setPlaying(false); setStepN((s) => Math.min(trace.order.length, s + 1)) }}>Step</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setPlaying(false); setStepN(1) }}>Reset</Btn>
                  </div>
                  <ol className="tnum mt-4 flex flex-wrap gap-1.5 font-mono text-[13px]">
                    {trace.order.map((v, i) => (
                      <li key={v} className={cx('flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 transition-colors duration-150', i < stepN ? 'bg-chalk text-[#17150f]' : 'bg-bg text-ink3')}>
                        {sample.nodes[v]}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[13px] leading-5 text-ink3">
                    Visit order from individual {sample.nodes[0]} (neighbours taken in increasing id).
                    {algo === 'bfs' && ` Distance from the start: ${[...new Set(trace.order.map((v) => trace.dist[v]))].map((d) => `${d}: ${trace.order.filter((v) => trace.dist[v] === d).length}`).join(', ')} (distance: count).`}
                  </p>
                </div>
              </div>
            </Demo>
          </Concept>

          <Concept
            id="paths"
            title="Shortest paths and contact chains"
            definition={<p>A path is a sequence of vertices joined by edges. The shortest path between two individuals has the fewest edges, found with BFS on an unweighted graph. A path shows how infection could travel; it says nothing about whether it did.</p>}
            math={<Formula>d(u, v) = min number of edges on a u–v path{'\n'}d(u, v) = ∞ if u, v lie in different components</Formula>}
            relevance={
              <>
                <p>A <span className="text-ink">possible route</span> is any contact chain in the graph. An <span className="text-ink">actual route</span> is a chain of successful transmissions recorded in the simulation log. The actual chain is usually longer than the shortest possible one, and exists only if every link actually transmitted.</p>
              </>
            }
          >
            <Demo title="Possible route and actual route" aside="same network, one complete simulated epidemic">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-hidden rounded-xl border border-line">
                  <NetworkCanvas
                    className="h-[380px]"
                    graph={graph}
                    positions={w.positions}
                    codes={noCodes}
                    highlightEdges={possibleEdges}
                    highlightNodes={route ?? []}
                    treeEdges={actual?.edges ?? []}
                    showTree
                    sizeByDegree
                    ariaLabel="Network with the shortest possible route in chalk and the actual infection chain in red"
                  />
                </div>
                <div className="space-y-3 text-[13px] leading-5">
                  <div className="grid grid-cols-2 gap-x-6">
                    <NumberField label="From" value={A} min={0} max={graph.n - 1} onChange={setA} />
                    <NumberField label="To" value={B} min={0} max={graph.n - 1} onChange={setB} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-ink"><span className="h-0.5 w-5 rounded" style={{ background: COLORS.chalk }} />Shortest possible route</div>
                    <div className="tnum mt-1 font-mono text-[12px] break-words text-ink2">
                      {route ? `${route.join(' → ')} (${route.length - 1} edge${route.length === 2 ? '' : 's'})` : `none: ${A} and ${B} are in different components`}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-ink"><span className="h-0.5 w-5 rounded" style={{ background: COLORS.I }} />Actual infection chain</div>
                    <div className="tnum mt-1 font-mono text-[12px] break-words text-ink2">
                      {actual
                        ? actual.chain.length === 1
                          ? `${B} was an initial case`
                          : `${actual.chain.join(' → ')} (${actual.chain.length - 1} transmissions)`
                        : `${B} was never infected in this run`}
                    </div>
                  </div>
                  <p className="text-ink3">The actual chain comes from the seeded run with the current parameters and interventions (day {finished.day}, {finished.counts.cumulative} infected). Individual {B} is infected through one chain only; the shortest possible route may never have carried the disease.</p>
                </div>
              </div>
            </Demo>
          </Concept>

          <Concept
            id="sir"
            title="Discrete-time SIR on a graph"
            definition={<p>Every vertex is Susceptible, Infected or Recovered/immune. Each day, every infected vertex tries to infect each susceptible neighbour and may recover. All decisions use the state at the start of the day, so someone infected today does not infect anyone until tomorrow.</p>}
            math={
              <Formula>
                P(infected today) = 1 − (1 − β)<sup>k</sup>{'\n'}P(recover today) = γ{'\n'}S(t) + I(t) + R(t) = N{'\n'}T = β / (β + γ − βγ){'\n'}R₀ ≈ T (⟨k²⟩ − ⟨k⟩) / ⟨k⟩
              </Formula>
            }
            relevance={
              <>
                <p>k is the number of infected neighbours. T is the chance an infected person ever passes the disease along one given edge. R₀ is the expected number of new cases per case; above 1 an outbreak can grow.</p>
                <p>Now: β = {config.beta.toFixed(3)}, γ = {config.gamma.toFixed(2)} gives T = {T.toFixed(3)} and R₀ ≈ {w.r0.toFixed(2)} on this network.</p>
              </>
            }
          />

          <Concept
            id="modify"
            title="Interventions as edits to the graph"
            definition={
              <>
                <p>Vaccination deletes a vertex's edges from every possible route. Social distancing deletes edges. Isolation switches a vertex's edges off for a while, then back on.</p>
              </>
            }
            math={<Formula>G′ = G − {'{vaccinated vertices}'} − {'{distanced edges}'}{'\n'}⟨k²⟩ falls faster than ⟨k⟩ when hubs are removed</Formula>}
            relevance={<p>R₀ depends on ⟨k²⟩ − ⟨k⟩, so the largest reductions come from deleting high-degree vertices. This is why targeted vaccination can beat random vaccination on networks with hubs, and why the effect is small on networks where every vertex has similar degree.</p>}
          />
        </div>
      </div>
    </div>
  )
}

function TraversalSvg({ sample, order, parent, step }: { sample: ReturnType<typeof sampleNeighbourhood>; order: number[]; parent: Int32Array; step: number }) {
  const n = sample.graph.n
  const R = 130
  const pos = (i: number) => ({ x: 160 + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: 160 + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) })
  const visited = new Map(order.slice(0, step).map((v, i) => [v, i]))
  const current = order[Math.min(step, order.length) - 1]
  return (
    <svg viewBox="0 0 320 320" className="w-full rounded-xl border border-line bg-[#0b0c0f]" role="img" aria-label="Sample graph with traversal order">
      {sample.graph.edges.map(([u, v], i) => {
        const p = pos(u)
        const q = pos(v)
        const tree = (parent[v] === u && visited.has(v)) || (parent[u] === v && visited.has(u))
        return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={tree ? COLORS.chalk : 'rgba(236,236,238,0.14)'} strokeWidth={tree ? 2.2 : 1} />
      })}
      {Array.from({ length: n }, (_, i) => {
        const p = pos(i)
        const seen = visited.has(i)
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={13} fill={seen ? COLORS.chalk : '#1c1f24'} stroke={i === current ? COLORS.I : 'rgba(236,236,238,0.2)'} strokeWidth={i === current ? 2.5 : 1} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontFamily="Geist Mono Variable, monospace" fill={seen ? '#17150f' : COLORS.ink2}>
              {sample.nodes[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
