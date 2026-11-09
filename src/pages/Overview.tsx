import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { RouteId } from '../App'
import { Simulation, computeMetrics, generateGraph, runScenarios, withEnabled } from '../engine'
import type { ScenarioResult, SimConfig } from '../engine'
import { DEFAULT_INTERVENTIONS } from '../engine'
import { DEFAULT_CONFIG } from '../state/workspace'
import { NetworkCanvas } from '../components/NetworkCanvas'
import { computeLayout } from '../components/useLayout'
import { Legend } from '../components/widgets'
import { Btn, Panel } from '../components/ui'
import { COLORS } from '../theme'

const MINI = { n: 160, avgDegree: 4, beta: 0.11, gamma: 0.09 }

function miniConfig(seed: number): SimConfig {
  return {
    network: { type: 'ba', n: MINI.n, avgDegree: MINI.avgDegree, rewireP: 0, seed },
    initialInfected: 2,
    beta: MINI.beta,
    gamma: MINI.gamma,
    interventions: DEFAULT_INTERVENTIONS,
    maxDays: 120,
  }
}

/** Finds the next seed whose epidemic actually takes off, so the loop always shows spread. */
function nextSeed(from: number): number {
  for (let s = from; s < from + 40; s++) {
    const cfg = miniConfig(s)
    const sim = new Simulation(generateGraph(cfg.network), cfg).runToEnd()
    if (computeMetrics(sim).attackRate > 0.55) return s
  }
  return from
}

/** A small live epidemic: the real engine, stepped on a timer, restarting with a fresh network when it ends. */
function MiniEpidemic() {
  const [seed, setSeed] = useState(() => nextSeed(3))
  const cfg = useMemo(() => miniConfig(seed), [seed])
  const graph = useMemo(() => generateGraph(cfg.network), [cfg])
  const positions = useMemo(() => computeLayout(graph), [graph])
  const sim = useMemo(() => new Simulation(graph, cfg), [graph, cfg])
  const [version, setVersion] = useState(0)
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    setVersion(0)
    let id = 0
    const tick = () => {
      if (sim.step() && !sim.isFinished()) {
        setVersion((v) => v + 1)
        id = window.setTimeout(tick, reduced.current ? 900 : 420)
      } else {
        setVersion((v) => v + 1)
        id = window.setTimeout(() => setSeed((s) => nextSeed(s + 1)), 3200)
      }
    }
    id = window.setTimeout(tick, 900)
    return () => window.clearTimeout(id)
  }, [sim])

  const m = useMemo(() => computeMetrics(sim), [sim, version])
  const codes = useMemo(() => sim.displayCodes(), [sim, version])
  const pulse = useMemo(() => {
    const ev = sim.eventsOnDay(sim.day)
    return sim.day > 0 && ev.length ? { key: version, nodes: ev.map((e) => e.target), edges: ev.map((e) => e.edge) } : null
  }, [sim, version])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-[#0b0c0f]">
      <NetworkCanvas
        className="h-[440px] sm:h-[540px]"
        graph={graph}
        positions={positions}
        codes={codes}
        pulse={pulse}
        interactive={false}
        ariaLabel="A small scale-free contact network on which a live epidemic spreads"
      />
      <div className="pointer-events-none absolute top-4 left-5 font-mono text-[13px] text-ink2">
        <span className="text-ink3">day </span>
        <span className="tnum text-[26px] text-ink">{m.day}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-[#0b0c0f] via-[#0b0c0f]/85 to-transparent px-5 pt-10 pb-4">
        <Legend />
        <div className="tnum font-mono text-[12px] text-ink3">
          <span style={{ color: COLORS.S }}>S {m.susceptible}</span> + <span style={{ color: COLORS.I }}>I {m.infected}</span> + <span style={{ color: COLORS.R }}>R {m.removed}</span> = {m.population}
        </div>
      </div>
    </div>
  )
}

const PAGES: Array<[RouteId, string, string]> = [
  ['live', 'Live simulation', 'Run the epidemic day by day, inspect any individual, and watch S, I and R change.'],
  ['network', 'Network explorer', 'Generate random, small-world or scale-free populations and measure them.'],
  ['interventions', 'Interventions', 'Vaccinate, distance or isolate, and see the contact graph change.'],
  ['comparison', 'Scenario comparison', 'Run every strategy on the same network and seed against a baseline.'],
  ['lab', 'Experiment lab', 'Five repeatable experiments with averages, spread and written interpretation.'],
  ['concepts', 'Mathematical concepts', 'Adjacency matrices, centrality, BFS and DFS, shortest paths and the SIR equations.'],
  ['about', 'About the project', 'Assumptions, limitations and the algorithms behind every number.'],
]

export function Overview({ go }: { go: (r: RouteId) => void }) {
  // The headline result is computed on arrival with the real engine, not typed in.
  const [result, setResult] = useState<ScenarioResult[] | null>(null)
  useEffect(() => {
    let live = true
    const cfg = DEFAULT_CONFIG
    const g = generateGraph(cfg.network)
    const iv = withEnabled({ ...DEFAULT_INTERVENTIONS, randomVax: { enabled: true, pct: 15 }, targetedVax: { enabled: true, pct: 15 } }, [])
    void runScenarios(
      g,
      cfg,
      iv,
      [
        { id: 'none', keys: [] },
        { id: 'random', keys: ['randomVax'] },
        { id: 'targeted', keys: ['targetedVax'] },
      ],
      30,
      undefined,
      () => !live,
    ).then((r) => live && r && setResult(r))
    return () => {
      live = false
    }
  }, [])

  const rnd = result?.find((r) => r.id === 'random')
  const tgt = result?.find((r) => r.id === 'targeted')
  const base = result?.find((r) => r.id === 'none')

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="rise max-w-xl">
          <h1 className="font-serif text-[40px] leading-[1.04] font-normal tracking-[-0.03em] sm:text-[56px] xl:text-[64px]">Epidemics travel along contacts. Cut the right ones.</h1>
          <p className="mt-6 max-w-[36rem] text-[18px] leading-[28px] text-ink2">
            A simulator for students of discrete mathematics. It runs a stochastic SIR epidemic on random, small-world and scale-free contact graphs, then tests vaccination, distancing and isolation on the same network.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Btn size="lg" variant="primary" onClick={() => go('live')}>
              Open live simulation
              <ArrowRight size={16} strokeWidth={1.5} />
            </Btn>
            <Btn size="lg" onClick={() => go('concepts')}>
              Read the mathematics
            </Btn>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-5 font-mono text-[13px]">
            <div>
              <dt className="text-ink3">Graph</dt>
              <dd className="mt-1 text-ink">G = (V, E)</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-ink3">Infection per day</dt>
              <dd className="mt-1 text-ink">1 − (1 − β)<sup>k</sup></dd>
            </div>
          </dl>
        </div>
        <div className="rise-2">
          <MiniEpidemic />
          <p className="mt-3 text-[13px] text-ink3">
            This is the real simulation engine on a {MINI.n}-person scale-free network (β {MINI.beta}, γ {MINI.gamma}), restarted on a new network each time the epidemic ends.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-5 font-serif text-[30px] leading-[1.15] tracking-[-0.02em]">The idea in three steps</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            ['People become a graph', 'Each person is a dot (a vertex) and each possible contact is a line (an edge). How the lines are arranged decides how an infection can travel.', 'G = (V, E)'],
            ['Infection follows the lines', 'Each day an infected person can pass it along every contact to a susceptible neighbour. The more infected contacts someone has, the likelier they catch it.', 'P = 1 − (1 − β)^k'],
            ['Break the chain', 'Remove links the infection needs: vaccinate people, cut contacts, isolate the infected. When no infected person has a susceptible contact left, the chain stops.', 'R₀ < 1'],
          ].map(([t, d, f], i) => (
            <li key={t} className="rounded-2xl border border-line bg-card p-5">
              <span className="tnum font-mono text-[12px] text-ink3">Step {i + 1}</span>
              <h3 className="mt-2 text-[16px] font-medium text-ink">{t}</h3>
              <p className="mt-2 text-[14px] leading-6 text-ink2">{d}</p>
              <p className="mt-3 font-mono text-[13px] text-chalk">{f}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rise-3 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="max-w-xl">
          <h2 className="font-serif text-[30px] leading-[1.15] tracking-[-0.02em]">Same vaccine supply, different outcome</h2>
          <p className="mt-3 text-[15px] leading-6 text-ink2">
            On the default scale-free network, a few hubs carry a large share of all contacts. Vaccinating the 15% of people with the highest degree centrality removes far more transmission routes than vaccinating 15% at random.
          </p>
          <p className="mt-3 text-[13px] leading-5 text-ink3">Mean of 30 runs on the same graph and the same initial cases. Computed when this page opened.</p>
        </div>
        <Panel>
          {!result || !base || !rnd || !tgt ? (
            <p className="py-6 text-center text-ink3">Running 90 simulations…</p>
          ) : (
            <ul className="space-y-5">
              {[
                { label: 'No vaccination', r: base },
                { label: 'Random 15%', r: rnd },
                { label: 'Targeted 15%, highest degree', r: tgt },
              ].map(({ label, r }, i) => (
                <li key={label}>
                  <div className="flex items-baseline justify-between gap-4 text-[14px]">
                    <span className="text-ink">{label}</span>
                    <span className="tnum font-mono text-ink2">
                      {(r.stats.attackRate.mean * 100).toFixed(0)}% infected
                      {i > 0 && <span className="ml-3 text-s">−{r.reduction.toFixed(0)}%</span>}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-raised">
                    <div className="h-full rounded" style={{ width: `${r.stats.attackRate.mean * 100}%`, background: i === 2 ? COLORS.chalk : COLORS.ink3 }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section>
        <h2 className="mb-4 text-[15px] font-medium">Where to go</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {PAGES.map(([id, title, text]) => (
            <li key={id}>
              <a
                href={`#/${id}`}
                onClick={(e) => {
                  e.preventDefault()
                  go(id)
                }}
                className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 first:rounded-t-2xl last:rounded-b-2xl hover:bg-raised"
              >
                <span className="w-52 shrink-0 text-[14px] text-ink">{title}</span>
                <span className="flex-1 text-[14px] text-ink2">{text}</span>
                <ArrowRight size={16} strokeWidth={1.5} className="text-ink3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink" />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-[13px] leading-5 text-ink3">
          Breaking the Chain is an educational model for a Discrete Mathematical Structures course. It is not a clinical or epidemiological prediction tool and must not be used for medical or public-health decisions.
        </p>
      </section>
    </div>
  )
}
