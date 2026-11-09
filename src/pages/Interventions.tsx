import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { RouteId } from '../App'
import { DEFAULT_INTERVENTIONS, Simulation, transmissibility } from '../engine'
import type { Graph, InterventionConfig, InterventionKey } from '../engine'
import { useWorkspace } from '../state/workspace'
import { NetworkCanvas } from '../components/NetworkCanvas'
import { Legend } from '../components/widgets'
import { Btn, PageHeader, Panel, SliderField, Switch, cx, fmtNum } from '../components/ui'

/** Statistics of the contact graph that remains after interventions delete vertices and edges. */
function residualStats(g: Graph, removedEdge: Uint8Array, vaccinated: Uint8Array, beta: number, gamma: number) {
  const n = g.n
  const alive = (v: number) => !vaccinated[v]
  const deg = new Int32Array(n)
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  let edges = 0
  g.edges.forEach(([u, v], e) => {
    if (removedEdge[e] || !alive(u) || !alive(v)) return
    deg[u]++
    deg[v]++
    edges++
    parent[find(u)] = find(v)
  })
  let remaining = 0
  let sum = 0
  let sumSq = 0
  let max = 0
  const size = new Map<number, number>()
  for (let v = 0; v < n; v++) {
    if (!alive(v)) continue
    remaining++
    sum += deg[v]
    sumSq += deg[v] * deg[v]
    max = Math.max(max, deg[v])
    const r = find(v)
    size.set(r, (size.get(r) ?? 0) + 1)
  }
  const avg = remaining ? sum / remaining : 0
  const second = remaining ? sumSq / remaining : 0
  const excess = avg > 0 ? (second - avg) / avg : 0
  return {
    remaining,
    edges,
    avgDegree: avg,
    maxDegree: max,
    components: size.size,
    largest: Math.max(0, ...size.values()),
    r0: transmissibility(beta, gamma) * excess,
  }
}

function Card({
  k,
  title,
  blurb,
  cfg,
  on,
  children,
}: {
  k: InterventionKey
  title: string
  blurb: ReactNode
  cfg: InterventionConfig
  on: (next: InterventionConfig) => void
  children: ReactNode
}) {
  const enabled = cfg[k].enabled
  return (
    <section className={cx('rounded-2xl border bg-card p-5 transition-colors duration-200', enabled ? 'border-line-strong' : 'border-line')}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-ink">{title}</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-ink2">{blurb}</p>
        </div>
        <Switch checked={enabled} onChange={(v) => on({ ...cfg, [k]: { ...cfg[k], enabled: v } })} label={`Enable ${title}`} />
      </div>
      <div className={cx('mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2', !enabled && 'opacity-45')}>{children}</div>
    </section>
  )
}

export function Interventions({ go }: { go: (r: RouteId) => void }) {
  const w = useWorkspace()
  const { config, graph, stats } = w
  const iv = config.interventions
  const set = w.setInterventions

  // A fresh day-0 simulation: shows exactly who would be vaccinated and which edges would be removed.
  const preview = useMemo(() => new Simulation(graph, config), [graph, config])
  const planned = useMemo(() => {
    const arr = new Uint8Array(graph.edges.length)
    if (iv.distancing.enabled) arr.set(preview.edgeDistanced)
    return arr
  }, [preview, iv.distancing.enabled, graph])
  const before = useMemo(
    () => residualStats(graph, new Uint8Array(graph.edges.length), new Uint8Array(graph.n), config.beta, config.gamma),
    [graph, config.beta, config.gamma],
  )
  const after = useMemo(
    () => residualStats(graph, planned, preview.vaccinated, config.beta, config.gamma),
    [graph, planned, preview, config.beta, config.gamma],
  )
  const topShare = useMemo(() => {
    const k = Math.round((iv.targetedVax.pct / 100) * graph.n)
    const deg = Array.from(graph.degree).sort((a, b) => b - a)
    const top = deg.slice(0, k).reduce((a, b) => a + b, 0)
    const total = 2 * graph.edges.length
    return { k, hub: total ? top / total : 0, rnd: graph.n ? k / graph.n : 0 }
  }, [graph, iv.targetedVax.pct])

  // Mean number of people within 1, 2 and 3 hops of a vertex, by breadth-first search from every vertex.
  const reach = useMemo(() => {
    const sums = [0, 0, 0]
    const dist = new Int32Array(graph.n)
    for (let s = 0; s < graph.n; s++) {
      dist.fill(-1)
      dist[s] = 0
      let frontier = [s]
      for (let hop = 1; hop <= 3 && frontier.length; hop++) {
        const next: number[] = []
        for (const u of frontier)
          for (const v of graph.adjNodes[u])
            if (dist[v] === -1) {
              dist[v] = hop
              next.push(v)
            }
        for (let h = hop; h <= 3; h++) sums[h - 1] += next.length
        frontier = next
      }
    }
    const n = Math.max(1, graph.n)
    return { one: sums[0] / n, two: sums[1] / n, three: sums[2] / n }
  }, [graph])

  // People found per detected case: each hop out is reached only through contacts already found, so the
  // k-th ring is discounted by coverage^k (an estimate; it ignores contacts reachable by several paths).
  const rings = [reach.one, reach.two - reach.one, reach.three - reach.two]
  const expectedReach = rings.slice(0, iv.tracing.depth).reduce((sum, ring, i) => sum + ring * iv.tracing.coverage ** (i + 1), 0)

  const anyOn = Object.values(iv).some((c) => c.enabled)
  const rows: Array<[string, string, string]> = [
    ['Individuals in play', fmtNum(before.remaining), fmtNum(after.remaining)],
    ['Contact edges', fmtNum(before.edges), fmtNum(after.edges)],
    ['Average degree', before.avgDegree.toFixed(2), after.avgDegree.toFixed(2)],
    ['Maximum degree', String(before.maxDegree), String(after.maxDegree)],
    ['Connected components', String(before.components), String(after.components)],
    ['Largest component', fmtNum(before.largest), fmtNum(after.largest)],
    ['Estimated R₀', before.r0.toFixed(2), after.r0.toFixed(2)],
  ]

  return (
    <div>
      <PageHeader
        title="Interventions"
        lede="Each intervention edits the contact graph: vaccination removes vertices, distancing removes edges, isolation switches a vertex's edges off for a while, and contact tracing searches outward from each detected case. Changes here apply to the live simulation and to the comparison."
        actions={
          <>
            <Btn variant="ghost" onClick={() => set(DEFAULT_INTERVENTIONS)} disabled={!anyOn}>
              Clear all
            </Btn>
            <Btn variant="primary" onClick={() => go('live')}>
              Run live
            </Btn>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div className="space-y-4">
          <Card k="randomVax" title="Random vaccination" cfg={iv} on={set} blurb="Immunise a uniform random sample of individuals before day 0. Vaccinated nodes are immune and cannot be infected or pass the infection on.">
            <SliderField label="Share of population" value={iv.randomVax.pct} min={0} max={80} step={1} format={(v) => `${v}%`} onChange={(pct) => set({ ...iv, randomVax: { ...iv.randomVax, pct } })} />
          </Card>

          <Card k="targetedVax" title="Targeted vaccination" cfg={iv} on={set} blurb="Immunise the individuals with the highest degree centrality first. A hub with degree d removes d possible transmission routes at once.">
            <SliderField label="Share of population" value={iv.targetedVax.pct} min={0} max={80} step={1} format={(v) => `${v}%`} onChange={(pct) => set({ ...iv, targetedVax: { ...iv.targetedVax, pct } })} />
            <div className="self-center text-[13px] leading-5 text-ink3">
              On this network the top {iv.targetedVax.pct}% by degree ({topShare.k} people) hold{' '}
              <span className="tnum font-mono text-ink">{(topShare.hub * 100).toFixed(0)}%</span> of all edge endpoints. {topShare.k} random people would hold about{' '}
              <span className="tnum font-mono text-ink">{(topShare.rnd * 100).toFixed(0)}%</span>.
            </div>
          </Card>

          <Card k="distancing" title="Social distancing" cfg={iv} on={set} blurb="Deactivate a random share of the contact edges, from a chosen day. Deactivated edges cannot carry infection but are drawn faintly so you can see what was removed.">
            <SliderField label="Contacts removed" value={iv.distancing.pct} min={0} max={90} step={1} format={(v) => `${v}%`} onChange={(pct) => set({ ...iv, distancing: { ...iv.distancing, pct } })} />
            <SliderField label="Starts on day" value={iv.distancing.startDay} min={0} max={30} step={1} onChange={(startDay) => set({ ...iv, distancing: { ...iv.distancing, startDay } })} hint="Day 0 means from the first step. Later values let the outbreak grow first." />
          </Card>

          <Card k="isolation" title="Isolation of detected cases" cfg={iv} on={set} blurb="Infected people are detected after a delay and isolated: all their edges go inactive. After the isolation period they rejoin the network if still infectious; if they have recovered they stay recovered. Contact tracing uses these detection settings too.">
            <SliderField label="Detection delay" value={iv.isolation.delay} min={0} max={10} step={1} format={(v) => `${v} d`} onChange={(delay) => set({ ...iv, isolation: { ...iv.isolation, delay } })} hint="Days after infection before an individual can be detected." />
            <SliderField label="Isolation period" value={iv.isolation.duration} min={1} max={21} step={1} format={(v) => `${v} d`} onChange={(duration) => set({ ...iv, isolation: { ...iv.isolation, duration } })} />
            <SliderField label="Detection probability per day" value={iv.isolation.detectProb} min={0.1} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(detectProb) => set({ ...iv, isolation: { ...iv.isolation, detectProb } })} hint="Once past the delay, chance each day that an infected person is detected. 1.00 means certain detection exactly at the delay." />
          </Card>

          <Card
            k="tracing"
            title="Contact tracing"
            cfg={iv}
            on={set}
            blurb={
              <>
                Each detected case is isolated, then its contacts are traced by breadth-first search over the contact graph and put in quarantine. People in quarantine can neither catch nor pass on the infection. Detection uses the delay and probability set under isolation{iv.isolation.enabled ? '' : ', even while that switch is off'}.
              </>
            }
          >
            <SliderField label="Tracing depth" value={iv.tracing.depth} min={1} max={3} step={1} format={(v) => (v === 1 ? '1 hop' : `${v} hops`)} onChange={(depth) => set({ ...iv, tracing: { ...iv.tracing, depth } })} hint="How many steps out from the detected case the search goes. 1 hop: their direct contacts. 2 hops: also the contacts of those contacts." />
            <SliderField label="Contacts found" value={iv.tracing.coverage} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(coverage) => set({ ...iv, tracing: { ...iv.tracing, coverage } })} hint="Chance that each contact is found. A contact who is missed is not traced onwards, so at 2 hops only about coverage² of second-step contacts are reached." />
            <SliderField label="Tracing delay" value={iv.tracing.delay} min={0} max={7} step={1} format={(v) => `${v} d`} onChange={(delay) => set({ ...iv, tracing: { ...iv.tracing, delay } })} hint="Days between detecting a case and its contacts starting quarantine. The infection can keep travelling in the meantime." />
            <SliderField label="Quarantine period" value={iv.tracing.duration} min={1} max={21} step={1} format={(v) => `${v} d`} onChange={(duration) => set({ ...iv, tracing: { ...iv.tracing, duration } })} />
            <div className="text-[13px] leading-5 text-ink3 sm:col-span-2">
              On this network a case has on average{' '}
              <span className="tnum font-mono text-ink">{reach.one.toFixed(1)}</span> contacts and{' '}
              <span className="tnum font-mono text-ink">{reach.two.toFixed(1)}</span> people within two hops, so tracing at depth {iv.tracing.depth} would aim to reach about{' '}
              <span className="tnum font-mono text-ink">{expectedReach.toFixed(1)}</span>{' '}
              people per detected case.
            </div>
          </Card>

          <p className="text-[13px] leading-5 text-ink3">
            With no switch on, the model is the baseline. To compare interventions side by side on the same network and seed, use{' '}
            <button className="text-ink2 underline underline-offset-2 hover:text-ink" onClick={() => go('comparison')}>
              Scenario comparison
            </button>
            .
          </p>
        </div>

        <div className="space-y-4">
          <Panel title="Original and reduced contact network" aside={<span className="tnum font-mono">day 0</span>} pad={false}>
            <div className="p-3">
              <div className="overflow-hidden rounded-xl border border-line">
                <NetworkCanvas
                  className="h-[380px]"
                  graph={graph}
                  positions={w.positions}
                  codes={preview.displayCodes()}
                  distanced={iv.distancing.enabled ? planned : null}
                  interactive={false}
                  ariaLabel="Preview of the contact network after interventions: vaccinated individuals are squares and removed contacts are dashed"
                />
              </div>
              <Legend className="mt-3" />
              <p className="mt-2 text-[12px] leading-4 text-ink3">Vaccinated individuals are squares. Dashed grey lines are contacts removed by distancing.</p>
            </div>
          </Panel>

          <Panel title="What the graph looks like afterwards">
            <p className="mb-3 text-[14px] leading-6 text-ink2">
              {anyOn
                ? `With these settings ${fmtNum(preview.vaccinatedTotal)} people are vaccinated and ${fmtNum(before.edges - after.edges)} of ${fmtNum(before.edges)} contacts (${before.edges ? Math.round(((before.edges - after.edges) / before.edges) * 100) : 0}%) are removed from the network. The average person has ${after.avgDegree.toFixed(2)} contacts instead of ${before.avgDegree.toFixed(2)}, and the estimated R₀ goes from ${before.r0.toFixed(2)} to ${after.r0.toFixed(2)}${after.r0 <= 1 ? ': below 1, so the chain should fade out.' : ': still above 1, so a large outbreak is still possible.'}`
                : 'Nothing is switched on, so every contact is available to the infection. Turn on an intervention to see how many links it cuts.'}
            </p>
            <table className="w-full text-[13px]">
              <thead className="text-ink3">
                <tr>
                  <th className="py-1.5 text-left font-normal"> </th>
                  <th className="py-1.5 text-right font-normal">Original</th>
                  <th className="py-1.5 text-right font-normal">Reduced</th>
                </tr>
              </thead>
              <tbody className="tnum font-mono">
                {rows.map(([label, a, b]) => (
                  <tr key={label} className="border-t border-line">
                    <td className="py-1.5 font-sans text-ink2">{label}</td>
                    <td className="py-1.5 text-right text-ink2">{a}</td>
                    <td className={cx('py-1.5 text-right', a !== b ? 'text-ink' : 'text-ink3')}>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[13px] leading-5 text-ink3">
              Computed from the graph that remains once vaccinated vertices and distanced edges are deleted. The original graph has {stats.edges} edges and {stats.vertices} vertices.
              {before.r0 > 1 && after.r0 <= 1 && ' The reduced network is below the epidemic threshold (R₀ ≤ 1).'}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
