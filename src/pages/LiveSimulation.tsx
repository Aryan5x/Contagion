import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, RotateCcw, Shuffle, StepForward } from 'lucide-react'
import type { RouteId } from '../App'
import { INTERVENTION_LABEL, NETWORK_LABEL, checkInvariants, enabledKeys } from '../engine'
import type { NetworkType } from '../engine'
import { SPEEDS, useWorkspace } from '../state/workspace'
import { NetworkCanvas } from '../components/NetworkCanvas'
import { NewInfectionsChart, SirChart } from '../components/charts'
import { DistributionBar, InvariantLedger, Legend, NodeInspector, nodeTip } from '../components/widgets'
import { GuideStrip, StoryPanel, Timeline } from '../components/Narrator'
import { Btn, NumberField, PageHeader, Panel, Segmented, SliderField, Stat, Switch, fmtNum, fmtPct } from '../components/ui'

type Tab = 'story' | 'setup' | 'data'

export function LiveSimulation({ go }: { go: (r: RouteId) => void }) {
  const w = useWorkspace()
  const { sim, metrics: m, config, version, baseline } = w
  const [selected, setSelected] = useState<number | null>(null)
  const [showTree, setShowTree] = useState(true)
  const [tab, setTab] = useState<Tab>('story')

  // A different graph invalidates the selection.
  useEffect(() => setSelected(null), [w.graph])

  const violations = useMemo(() => checkInvariants(sim), [sim, version])
  const treeEdges = useMemo(() => sim.log.map((e) => e.edge), [sim, version])
  const pulse = useMemo(() => {
    const ev = sim.eventsOnDay(sim.day)
    return sim.day > 0 && ev.length ? { key: version, nodes: ev.map((e) => e.target), edges: ev.map((e) => e.edge) } : null
  }, [sim, version])
  const distanced = sim.distancingActive ? sim.edgeDistanced : null
  const active = enabledKeys(config.interventions)

  // Keyboard shortcuts, ignored while typing in a field.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, select, textarea, button') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (w.running) w.pause()
        else w.start()
      } else if (e.key === 'n' || e.key === 'ArrowRight') w.stepOnce()
      else if (e.key === 'r') w.reset()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  const runLabel = w.running ? 'Pause' : m.day === 0 ? 'Start' : 'Resume'
  const net = config.network
  const recent = sim.log.slice(-7).reverse()

  const TABS: Array<{ value: Tab; label: string }> = [
    { value: 'story', label: 'Story' },
    { value: 'setup', label: 'Setup' },
    { value: 'data', label: 'Data' },
  ]

  return (
    <div>
      <PageHeader
        title="Live simulation"
        lede="Watch an infection travel through a network of contacts, and see why it spreads the way it does. The Story tab explains every day in plain language."
        actions={
          <>
            {!w.guideOpen && (
              <Btn variant="ghost" onClick={() => w.setGuideOpen(true)}>
                How to read this
              </Btn>
            )}
            <Btn variant="ghost" onClick={() => go('interventions')}>
              {active.length ? `${active.length} intervention${active.length > 1 ? 's' : ''} on` : 'No intervention'}
            </Btn>
          </>
        }
      />

      {w.guideOpen && <GuideStrip onHide={() => w.setGuideOpen(false)} onGoInterventions={() => go('interventions')} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="rise-2 flex flex-wrap items-center gap-2">
            <Btn variant="primary" onClick={() => (w.running ? w.pause() : w.start())} disabled={m.finished && !w.running}>
              {w.running ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
              {m.finished && !w.running ? 'Epidemic over' : runLabel}
            </Btn>
            <Btn onClick={w.stepOnce} disabled={m.finished} title="Advance one day (N)">
              <StepForward size={16} strokeWidth={1.5} />
              Step one day
            </Btn>
            <Btn onClick={w.reset} title="Reset the epidemic on this network (R)">
              <RotateCcw size={16} strokeWidth={1.5} />
              Reset
            </Btn>
            <Btn variant="ghost" onClick={w.newNetwork} title="Draw a new random seed and generate a new network">
              <Shuffle size={16} strokeWidth={1.5} />
              New network
            </Btn>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-[13px] text-ink3 sm:inline">Speed</span>
              <Segmented
                label="Simulation speed in days per second"
                size="sm"
                value={w.speed}
                onChange={w.setSpeed}
                options={SPEEDS.map((s) => ({ value: s, label: `${s}×`, title: `${s} day${s > 1 ? 's' : ''} per second` }))}
              />
            </div>
          </div>

          <div className="rise-2 relative overflow-hidden rounded-2xl border border-line">
            <NetworkCanvas
              className="h-[520px] sm:h-[620px]"
              graph={w.graph}
              positions={w.positions}
              codes={w.codes}
              distanced={distanced}
              treeEdges={treeEdges}
              showTree={showTree}
              pulse={pulse}
              selected={selected}
              onSelect={setSelected}
              labelHubs={3}
              renderTip={(id) => nodeTip(sim.getNode(id))}
            />
            <div className="pointer-events-none absolute top-3 left-4 font-mono text-[13px] text-ink2">
              <span className="text-ink3">day </span>
              <span className="tnum text-[22px] text-ink">{m.day}</span>
              {m.finished && <span className="ml-3 text-ink3">epidemic over</span>}
            </div>
            <div className="absolute bottom-3 left-4 max-w-[70%] rounded-lg bg-[#0b0c0f]/85 py-1.5 pr-2">
              <Legend />
            </div>
            <div className="absolute right-4 bottom-3 flex items-center gap-2 rounded-lg bg-[#0b0c0f]/85 py-1 pl-2 text-[12px] text-ink2">
              Show the chain
              <Switch checked={showTree} onChange={setShowTree} label="Highlight the contacts that carried an infection" />
            </div>
            {selected !== null && (
              <div className="absolute top-3 right-3">
                <NodeInspector node={sim.getNode(selected)} onClose={() => setSelected(null)} />
              </div>
            )}
          </div>

          <InvariantLedger m={m} violations={violations} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Infected now" value={fmtNum(m.infected)} tone="var(--color-i)" />
            <Stat label="Cumulative infections" value={fmtNum(m.cumulativeInfections)} sub={`${fmtNum(m.uninfected)} never infected`} />
            <Stat label="Peak infected" value={fmtNum(m.peakInfected)} sub={`on day ${m.peakDay}`} />
            <Stat label="Attack rate" value={fmtPct(m.attackRate, 1)} hint="Share of the population that has been infected at any time: cumulative infections / N." />
            <Stat label="Recovered" value={fmtNum(m.recovered)} tone="var(--color-r)" sub={`${fmtNum(m.vaccinated)} vaccinated`} />
            <Stat label="Isolated" value={fmtNum(m.currentlyIsolated)} tone="var(--color-iso)" sub={`${fmtNum(m.totalIsolated)} in total`} />
            <Stat label="Susceptible" value={fmtNum(m.susceptible)} tone="var(--color-s)" sub="could still catch it" />
            <Stat label="Transmissions" value={fmtNum(sim.log.length)} sub="contacts that carried it" hint="Each transmission is one edge of the contact network that actually carried the infection. Together they form the chain." />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Epidemic progression" aside={<span className="tnum font-mono">N = {m.population}</span>}>
              <SirChart history={sim.history} population={m.population} height={300} baseline={baseline?.history ?? null} />
              <p className="mt-2 text-[13px] leading-5 text-ink3">
                How to read it: green is people who could still catch it, red is people infectious now, blue is people who can no longer catch it (recovered or vaccinated). The three always add up to {m.population}.
                {baseline && ' The dashed grey line is how many would be infected at once if there were no intervention at all.'}
              </p>
            </Panel>
            <Panel title="New infections per day">
              <NewInfectionsChart history={sim.history} height={190} />
              <p className="mt-2 text-[13px] leading-5 text-ink3">Each bar counts the contacts that carried the infection that day.</p>
            </Panel>
          </div>
        </div>

        <aside className="rise-3 min-w-0">
          <div className="mb-3 flex justify-center xl:justify-start">
            <Segmented value={tab} onChange={setTab} label="Side panel" options={TABS} />
          </div>

          {tab === 'story' && (
            <div className="space-y-4">
              <Panel title="What is happening">
                <StoryPanel
                  sim={sim}
                  metrics={m}
                  baseline={baseline}
                  onSelect={setSelected}
                  showTree={showTree}
                  onToggleTree={setShowTree}
                />
              </Panel>
              <Panel title="Day by day">
                <Timeline sim={sim} />
              </Panel>
            </div>
          )}

          {tab === 'setup' && (
            <div className="space-y-4">
              <Panel title="Parameters">
                <div className="space-y-1">
                  <div className="pb-2">
                    <div className="mb-1.5 text-[13px] text-ink2">Network model</div>
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
                  <SliderField label="Population" value={net.n} min={20} max={1000} step={10} onChange={(n) => w.setNetwork({ n })} hint="Number of vertices |V| in the contact graph." />
                  <SliderField
                    label="Average contacts"
                    value={net.avgDegree}
                    min={2}
                    max={20}
                    step={1}
                    onChange={(avgDegree) => w.setNetwork({ avgDegree })}
                    hint="Target average degree ⟨k⟩. Random: p = ⟨k⟩/(n−1). Small-world: k nearest neighbours. Scale-free: m = ⟨k⟩/2 edges per new node."
                  />
                  {net.type === 'ws' && (
                    <SliderField
                      label="Rewiring probability"
                      value={net.rewireP}
                      min={0}
                      max={1}
                      step={0.01}
                      format={(v) => v.toFixed(2)}
                      onChange={(rewireP) => w.setNetwork({ rewireP })}
                      hint="Chance that each lattice edge is rewired to a random vertex. Small values keep clustering and add a few long-range shortcuts."
                    />
                  )}
                  <SliderField label="Initial infected" value={config.initialInfected} min={1} max={Math.min(30, net.n)} step={1} onChange={(initialInfected) => w.setParams({ initialInfected })} />
                  <SliderField
                    label="Transmission β"
                    value={config.beta}
                    min={0}
                    max={0.5}
                    step={0.005}
                    format={(v) => v.toFixed(3)}
                    onChange={(beta) => w.setParams({ beta })}
                    hint="Probability that an infected individual infects one susceptible neighbour in one day, per active contact. A susceptible with k infected neighbours is infected with probability 1 − (1 − β)^k."
                  />
                  <SliderField
                    label="Recovery γ"
                    value={config.gamma}
                    min={0.01}
                    max={1}
                    step={0.01}
                    format={(v) => v.toFixed(2)}
                    onChange={(gamma) => w.setParams({ gamma })}
                    hint="Probability that an infected individual recovers on a given day. The mean infectious period is 1/γ days."
                  />
                  <NumberField label="Random seed" value={net.seed} min={0} max={999999} onChange={(seed) => w.setNetwork({ seed: Math.max(0, Math.round(seed)) })} hint="Same seed and parameters reproduce the same network, initial cases and epidemic." />
                </div>
                {w.error && <p className="mt-2 text-[13px] text-i">{w.error}</p>}
                <div className="mt-4 rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] text-ink2">
                  <div className="flex items-center justify-between">
                    <span>Estimated R₀</span>
                    <span className="tnum font-mono text-ink">{w.r0.toFixed(2)}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-4 text-ink3">
                    {w.r0 > 1 ? 'Above 1: each case infects more than one person on average, so a large outbreak is possible.' : 'Below 1: each case infects fewer than one person on average, so outbreaks should die out.'} Estimated from the contacts in this network.
                  </p>
                </div>
                <p className="mt-3 text-[12px] leading-4 text-ink3">Changing a parameter resets the run. Drag to pan, scroll to zoom, double-click to recentre.</p>
              </Panel>

              <Panel title="Active interventions" aside={<button onClick={() => go('interventions')} className="text-ink2 underline-offset-2 hover:text-ink hover:underline">Edit</button>}>
                {active.length === 0 ? (
                  <p className="text-[13px] text-ink3">None. This is the baseline scenario: nothing is cutting the chain.</p>
                ) : (
                  <ul className="space-y-1.5 text-[13px]">
                    {active.map((k) => {
                      const c = config.interventions
                      const detail =
                        k === 'randomVax' ? `${c.randomVax.pct}% of population` :
                        k === 'targetedVax' ? `top ${c.targetedVax.pct}% by degree` :
                        k === 'distancing' ? `${c.distancing.pct}% of edges off` :
                        `after ${c.isolation.delay} d, for ${c.isolation.duration} d`
                      return (
                        <li key={k} className="flex justify-between gap-3">
                          <span className="text-ink">{INTERVENTION_LABEL[k]}</span>
                          <span className="tnum font-mono text-ink3">{detail}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          )}

          {tab === 'data' && (
            <div className="space-y-4">
              <Panel title="Population by state">
                <DistributionBar m={m} />
              </Panel>
              <Panel title="Transmission log" aside={<span className="tnum font-mono">{sim.log.length} total</span>}>
                {recent.length === 0 ? (
                  <p className="text-[13px] text-ink3">No transmissions yet. Press Start or Step.</p>
                ) : (
                  <ol className="space-y-1 font-mono text-[12px]">
                    {recent.map((e) => (
                      <li key={e.target} className="tnum flex gap-3 text-ink2">
                        <span className="w-14 text-ink3">day {e.day}</span>
                        <button onClick={() => setSelected(e.source)} className="text-ink hover:underline">{e.source}</button>
                        <span className="text-ink3">infected</span>
                        <button onClick={() => setSelected(e.target)} className="text-ink hover:underline">{e.target}</button>
                      </li>
                    ))}
                  </ol>
                )}
                {m.observedR !== null && (
                  <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink3">
                    Observed early R (cases infected by day 5, once recovered): <span className="tnum font-mono text-ink">{m.observedR.toFixed(2)}</span>
                  </p>
                )}
              </Panel>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
