import { useEffect, useMemo, useRef, useState } from 'react'
import { NETWORK_LABEL, NETWORK_SHORT, configSlug, connectedComponents, edgeListCSV, degreeCentrality, estimateR0, generateGraph, graphStats, rankByDegree } from '../engine'
import type { NetworkType } from '../engine'
import { useWorkspace } from '../state/workspace'
import { NetworkCanvas } from '../components/NetworkCanvas'
import { DegreeChart } from '../components/charts'
import { Btn, NumberField, PageHeader, Panel, Segmented, SliderField, Stat, fmtNum } from '../components/ui'
import { COLORS, SERIES } from '../theme'
import { ExportPanel } from '../components/ExportPanel'
import { downloadCanvasPNG, downloadText } from '../components/download'
import { Shuffle } from 'lucide-react'

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
const ramp = (t: number) => `rgb(${lerp(70, 239, t)},${lerp(80, 234, t)},${lerp(100, 224, t)})`

export function NetworkExplorer() {
  const w = useWorkspace()
  const { graph, stats, config } = w
  const net = config.network
  const [mode, setMode] = useState<'degree' | 'components'>('degree')
  const [logScale, setLogScale] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const canvasWrap = useRef<HTMLDivElement>(null)
  useEffect(() => setSelected(null), [graph])

  const codes = useMemo(() => new Uint8Array(graph.n), [graph])
  const comps = useMemo(() => connectedComponents(graph), [graph])
  const nodeColors = useMemo(() => {
    if (mode === 'degree') {
      const max = Math.max(1, stats.maxDegree)
      return Array.from({ length: graph.n }, (_, i) => ramp(Math.sqrt(graph.degree[i] / max)))
    }
    const order = comps.sizes.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1])
    const rank = new Map(order.map((c, i) => [c, i]))
    return Array.from({ length: graph.n }, (_, i) => {
      const r = rank.get(comps.labels[i]) ?? 0
      return r === 0 ? '#efeae0' : SERIES[(r % (SERIES.length - 1)) + 1]
    })
  }, [mode, graph, stats.maxDegree, comps])

  const hubs = useMemo(() => rankByDegree(graph).slice(0, 8), [graph])
  const compare = useMemo(
    () =>
      (['er', 'ws', 'ba'] as NetworkType[]).map((type) => {
        const g = generateGraph({ ...net, type })
        const s = graphStats(g)
        return { type, s, r0: estimateR0(config.beta, config.gamma, s) }
      }),
    [net, config.beta, config.gamma],
  )
  const topShare = useMemo(() => {
    const k = Math.max(1, Math.round(graph.n * 0.1))
    const deg = Array.from(graph.degree).sort((a, b) => b - a)
    const top = deg.slice(0, k).reduce((a, b) => a + b, 0)
    return { k, share: graph.edges.length ? top / (2 * graph.edges.length) : 0 }
  }, [graph])

  return (
    <div>
      <PageHeader
        title="Network explorer"
        lede="The population as a graph G = (V, E). Every figure on this page is measured from the generated graph, nothing is typed in."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div ref={canvasWrap} className="rise-2 relative overflow-hidden rounded-2xl border border-line">
            <NetworkCanvas
              className="h-[480px] sm:h-[560px]"
              graph={graph}
              positions={w.positions}
              codes={codes}
              nodeColors={nodeColors}
              selected={selected}
              onSelect={setSelected}
              renderTip={(id) => (
                <div>
                  <div className="font-medium text-ink">Individual {id}</div>
                  <div className="tnum font-mono text-[12px] text-ink2">
                    degree {graph.degree[id]} · C_D {degreeCentrality(graph, id).toFixed(3)}
                  </div>
                </div>
              )}
              ariaLabel="Contact network coloured by degree or component"
            />
            <div className="absolute top-3 left-3">
              <Segmented
                label="Colour nodes by"
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'degree', label: 'By degree' },
                  { value: 'components', label: 'By component' },
                ]}
              />
            </div>
            <div className="absolute bottom-3 left-4 rounded-lg bg-[#0b0c0f]/85 py-1 pr-2 text-[12px] text-ink2">
              {mode === 'degree' ? (
                <span className="flex items-center gap-2">
                  low degree
                  <span className="h-1.5 w-24 rounded" style={{ background: `linear-gradient(to right, ${ramp(0)}, ${ramp(1)})` }} />
                  high degree · node size also scales with degree
                </span>
              ) : (
                <span>Largest component in chalk, each smaller component in its own colour</span>
              )}
            </div>
            {selected !== null && (
              <div className="absolute top-3 right-3 w-56 rounded-xl border border-line-strong bg-raised/95 p-3 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                <div className="flex justify-between">
                  <span className="font-medium text-ink">Individual {selected}</span>
                  <button className="text-ink3 hover:text-ink" onClick={() => setSelected(null)}>Close</button>
                </div>
                <div className="tnum mt-1 space-y-0.5 font-mono text-[12px] text-ink2">
                  <div>degree {graph.degree[selected]}</div>
                  <div>C_D = {graph.degree[selected]}/{graph.n - 1} = {degreeCentrality(graph, selected).toFixed(3)}</div>
                  <div>component of {comps.sizes[comps.labels[selected]]}</div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Vertices |V|" value={fmtNum(stats.vertices)} />
            <Stat label="Edges |E|" value={fmtNum(stats.edges)} />
            <Stat label="Average degree" value={stats.avgDegree.toFixed(2)} sub={`min ${stats.minDegree}`} hint="⟨k⟩ = 2|E| / |V|" />
            <Stat label="Maximum degree" value={stats.maxDegree} sub={`C_D ${(stats.maxDegree / Math.max(1, stats.vertices - 1)).toFixed(3)}`} />
            <Stat label="Density" value={stats.density.toFixed(4)} hint="2|E| / (|V|(|V|−1)): the fraction of possible contacts that exist." />
            <Stat label="Connected components" value={stats.components} sub={`largest ${stats.largestComponent} (${((100 * stats.largestComponent) / stats.vertices).toFixed(0)}%)`} />
            <Stat label="Clustering" value={stats.clustering.toFixed(3)} hint="Average local clustering coefficient: the chance that two contacts of a person also contact each other." />
            <Stat label="Mean path length" value={stats.avgPathLength.toFixed(2)} sub="largest component, sampled BFS" hint="Average number of edges on a shortest path between two individuals of the largest component, from BFS out of up to 40 sources." />
          </div>

          <Panel title="Reading this network">
            <p className="text-[14px] leading-6 text-ink2">
              {net.type === 'er' &&
                `Every pair of people is linked with the same small probability (p = ${(net.avgDegree / Math.max(1, net.n - 1)).toFixed(3)}). Contacts are spread evenly: most people have close to the average of ${stats.avgDegree.toFixed(1)}, and the busiest person has only ${stats.maxDegree}. Nobody is a hub, so an infection has no shortcut to many people at once.`}
              {net.type === 'ws' &&
                `People sit on a ring and know their nearest neighbours, so friends tend to know each other (clustering ${stats.clustering.toFixed(2)}). A share of ${net.rewireP.toFixed(2)} of the links are rewired to random people, which creates shortcuts: any two people are only about ${stats.avgPathLength.toFixed(1)} steps apart. The infection spreads locally but can jump along a shortcut.`}
              {net.type === 'ba' &&
                `Newcomers prefer to connect to people who already have many contacts, so a few hubs emerge. The busiest person has ${stats.maxDegree} contacts, ${(stats.maxDegree / Math.max(0.01, stats.avgDegree)).toFixed(1)}× the average of ${stats.avgDegree.toFixed(1)}. An infection that reaches a hub can reach ${stats.maxDegree} people at once, which is why hubs matter for vaccination.`}{' '}
              {stats.components === 1
                ? 'Everyone is connected to everyone else through some chain of contacts, so an infection can in principle reach the whole population.'
                : `The population splits into ${stats.components} separate groups (the largest has ${stats.largestComponent} people). An infection can never leave the group it starts in.`}
            </p>
          </Panel>

          <Panel title="The three models side by side" aside={<span>same n, ⟨k⟩ and seed</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-ink3">
                  <tr className="border-b border-line">
                    {['Model', 'Edges', 'Max degree', 'Clustering', 'Path length', 'Components', '⟨k²⟩', 'R₀ estimate'].map((h, i) => (
                      <th key={h} className={`px-2 py-2 font-normal ${i ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tnum font-mono">
                  {compare.map(({ type, s, r0 }) => (
                    <tr key={type} className={`border-b border-line last:border-0 ${type === net.type ? 'text-ink' : 'text-ink2'}`}>
                      <td className="px-2 py-2 font-sans">{NETWORK_SHORT[type]}{type === net.type && <span className="ml-2 text-ink3">current</span>}</td>
                      <td className="px-2 py-2 text-right">{s.edges}</td>
                      <td className="px-2 py-2 text-right">{s.maxDegree}</td>
                      <td className="px-2 py-2 text-right">{s.clustering.toFixed(3)}</td>
                      <td className="px-2 py-2 text-right">{s.avgPathLength.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">{s.components}</td>
                      <td className="px-2 py-2 text-right">{s.secondMoment.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right">{r0.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-ink3">
              R₀ uses the current β = {config.beta.toFixed(3)} and γ = {config.gamma.toFixed(2)}. Similar average degree, very different second moment ⟨k²⟩: hubs inflate ⟨k²⟩, and ⟨k²⟩ controls how readily an infection spreads.
            </p>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Generate">
            <div className="space-y-1">
              <div className="pb-2">
                <Segmented<NetworkType>
                  label="Network model"
                  value={net.type}
                  onChange={(type) => w.setNetwork({ type })}
                  options={[
                    { value: 'er', label: 'Random', title: NETWORK_LABEL.er },
                    { value: 'ws', label: 'Small-world', title: NETWORK_LABEL.ws },
                    { value: 'ba', label: 'Scale-free', title: NETWORK_LABEL.ba },
                  ]}
                />
              </div>
              <SliderField label="Population" value={net.n} min={20} max={1000} step={10} onChange={(n) => w.setNetwork({ n })} />
              <SliderField label="Average contacts" value={net.avgDegree} min={2} max={20} step={1} onChange={(avgDegree) => w.setNetwork({ avgDegree })} />
              {net.type === 'ws' && (
                <SliderField label="Rewiring probability" value={net.rewireP} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(rewireP) => w.setNetwork({ rewireP })} />
              )}
              <NumberField label="Random seed" value={net.seed} min={0} max={999999} onChange={(seed) => w.setNetwork({ seed: Math.max(0, Math.round(seed)) })} />
            </div>
            <Btn className="mt-3 w-full" onClick={w.newNetwork}>
              <Shuffle size={16} strokeWidth={1.5} />
              New network
            </Btn>
            <p className="mt-3 text-[12px] leading-4 text-ink3">The same network is used by the live simulation, interventions and comparison.</p>
          </Panel>

          <Panel
            title="Degree distribution"
            aside={
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" className="accent-[#efeae0]" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
                log scale
              </label>
            }
          >
            <DegreeChart data={stats.degreeDistribution} logScale={logScale} />
            <p className="mt-2 text-[13px] leading-5 text-ink3">
              The top 10% of individuals hold <span className="tnum font-mono text-ink">{(topShare.share * 100).toFixed(0)}%</span> of all edge endpoints.
            </p>
          </Panel>

          <Panel title="Most connected individuals">
            <table className="w-full text-[13px]">
              <thead className="text-ink3">
                <tr>
                  <th className="py-1 text-left font-normal">Rank</th>
                  <th className="py-1 text-right font-normal">ID</th>
                  <th className="py-1 text-right font-normal">Degree</th>
                  <th className="py-1 text-right font-normal">C_D</th>
                </tr>
              </thead>
              <tbody className="tnum font-mono">
                {hubs.map((id, i) => (
                  <tr key={id} className={selected === id ? 'bg-raised' : ''}>
                    <td className="py-1 pl-1 text-ink3">{i + 1}</td>
                    <td className="py-1 text-right">
                      <button className="text-ink underline-offset-2 hover:underline" onClick={() => setSelected(id)}>{id}</button>
                    </td>
                    <td className="py-1 text-right text-ink">{graph.degree[id]}</td>
                    <td className="py-1 pr-1 text-right text-ink2">{degreeCentrality(graph, id).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] leading-4 text-ink3">Click an ID to highlight its contacts on the network.</p>
          </Panel>

          <ExportPanel
            items={[
              { label: 'Edge list', title: 'CSV: every edge {u, v} of the graph with both degrees', run: () => downloadText(edgeListCSV(graph), `breaking-the-chain_${configSlug(config)}_edges.csv`) },
              { label: 'Network image', title: `PNG of the network, coloured ${mode === 'degree' ? 'by degree' : 'by component'}`, run: () => downloadCanvasPNG(canvasWrap.current, `breaking-the-chain_${configSlug(config)}_${mode}.png`, COLORS.canvas) },
            ]}
            note="The edge list can be loaded into a spreadsheet or a graph tool such as Gephi or NetworkX."
          />
        </aside>
      </div>
    </div>
  )
}
