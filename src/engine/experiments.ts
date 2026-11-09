import type { NetworkType, SimConfig } from './types'
import { DEFAULT_INTERVENTIONS, withEnabled } from './interventionEngine'
import type { VariantResult, VariantSpec } from './experimentRunner'
import { estimateR0, generateGraph, graphStats, transmissibility } from './index'

export interface ExperimentSettings {
  n: number
  runs: number
  seed: number
}

export const DEFAULT_EXPERIMENT_SETTINGS: ExperimentSettings = { n: 300, runs: 30, seed: 7 }

export type ExperimentId = 'connectivity' | 'vaccination' | 'topology' | 'transmission' | 'distancing'

export interface ExperimentDef {
  id: ExperimentId
  title: string
  blurb: string
  objective: string
  changed: string[]
  constant: (s: ExperimentSettings) => string[]
  build: (s: ExperimentSettings) => Array<VariantSpec & { x?: number; note?: string }>
  /** Text written from the measured results, so it always matches what was just simulated. */
  interpret: (results: VariantResult[], s: ExperimentSettings) => { interpretation: string[]; conclusion: string }
  /** Numeric x for variants plotted against a variable (experiment 4). */
  xLabel?: string
}

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`

function baseConfig(s: ExperimentSettings, over: Partial<SimConfig> & { type: NetworkType; avgDegree: number; rewireP?: number }): SimConfig {
  return {
    network: { type: over.type, n: s.n, avgDegree: over.avgDegree, rewireP: over.rewireP ?? 0.1, seed: s.seed },
    initialInfected: 3,
    beta: over.beta ?? 0.08,
    gamma: over.gamma ?? 0.2,
    interventions: over.interventions ?? DEFAULT_INTERVENTIONS,
    maxDays: 365,
  }
}

const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x >= xs[i - 1] - 0.02)

function r0Of(cfg: SimConfig) {
  const st = graphStats(generateGraph(cfg.network))
  return estimateR0(cfg.beta, cfg.gamma, st)
}

export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'connectivity',
    title: 'Effect of network connectivity',
    blurb: 'Low, medium and high average degree on random graphs',
    objective:
      'Understand how increasing the number of social connections per person changes how far an infection travels.',
    changed: ['Average degree ⟨k⟩ of the Erdős–Rényi graph: 2, 4, 8'],
    constant: (s) => [
      `Population n = ${s.n}`,
      'β = 0.08, γ = 0.20, 3 initially infected',
      'Network model: Erdős–Rényi, same seed',
    ],
    build: (s) =>
      [2, 4, 8].map((k) => ({
        id: `k${k}`,
        label: `⟨k⟩ = ${k}`,
        config: baseConfig(s, { type: 'er', avgDegree: k }),
        note: ['low', 'medium', 'high'][[2, 4, 8].indexOf(k)],
      })),
    interpret: (res, s) => {
      const cfgs = [2, 4, 8].map((k) => baseConfig(s, { type: 'er', avgDegree: k }))
      const r0 = cfgs.map(r0Of)
      const T = transmissibility(0.08, 0.2)
      const ar = res.map((r) => r.stats.attackRate.mean)
      const mj = res.map((r) => r.stats.majorOutbreakPct)
      const ok = rising(ar)
      return {
        interpretation: [
          `Along an edge, an infected person eventually transmits with probability T = β / (β + γ − βγ) = ${T.toFixed(3)}. On a random graph, an infection reaches on average T·(⟨k²⟩ − ⟨k⟩)/⟨k⟩ new people per case. The measured degree moments of the three generated graphs give R₀ ≈ ${r0.map((x) => x.toFixed(2)).join(', ')} for ⟨k⟩ = 2, 4, 8.`,
          `R₀ < 1 means each case produces fewer than one new case on average, so outbreaks fade out early; R₀ > 1 allows an outbreak to spread to a macroscopic part of the connected component. Raising ⟨k⟩ raises R₀ roughly in proportion.`,
          `Measured mean attack rate: ${ar.map((x) => pct(x)).join(' → ')}. Share of runs with an outbreak above 10% of the population: ${mj.map((x) => `${x.toFixed(0)}%`).join(' → ')}.`,
        ],
        conclusion: ok
          ? `More connections give more transmission pathways. Attack rate climbed from ${pct(ar[0])} at ⟨k⟩ = 2 (R₀ ≈ ${r0[0].toFixed(2)}) to ${pct(ar[2])} at ⟨k⟩ = 8 (R₀ ≈ ${r0[2].toFixed(2)}). Where R₀ < 1 an outbreak above 10% of the population occurred in ${mj[0].toFixed(0)}% of runs; where R₀ > 1 it occurred in ${mj[1].toFixed(0)}% and ${mj[2].toFixed(0)}%.`
          : `The attack rate did not rise monotonically in this sample (${ar.map((x) => pct(x)).join(', ')}). Stochastic variation dominates near R₀ ≈ 1, so increase the number of runs before reading a trend.`,
      }
    },
  },
  {
    id: 'vaccination',
    title: 'Random vs targeted vaccination',
    blurb: 'Same network, same 20% vaccine supply, different targeting',
    objective:
      'Show why finding highly connected individuals matters: the same number of vaccinations removes very different numbers of transmission pathways.',
    changed: ['Who is vaccinated: nobody, a random 20%, or the 20% with the highest degree'],
    constant: (s) => [
      `Scale-free (Barabási–Albert) network, n = ${s.n}, ⟨k⟩ = 6, same graph for all variants`,
      'β = 0.08, γ = 0.20, same 3 initially infected',
      'Vaccinated individuals are chosen among those not initially infected',
    ],
    build: (s) => {
      const mk = (keys: Array<'randomVax' | 'targetedVax'>) =>
        baseConfig(s, {
          type: 'ba',
          avgDegree: 6,
          interventions: withEnabled({ ...DEFAULT_INTERVENTIONS, randomVax: { enabled: true, pct: 20 }, targetedVax: { enabled: true, pct: 20 } }, keys),
        })
      return [
        { id: 'none', label: 'No vaccination', config: mk([]) },
        { id: 'random', label: 'Random 20%', config: mk(['randomVax']) },
        { id: 'targeted', label: 'Targeted 20% (top degree)', config: mk(['targetedVax']) },
      ]
    },
    interpret: (res, s) => {
      const [none, rnd, tgt] = res
      const g = generateGraph(none.config.network)
      const total = g.edges.length
      const count = Math.round(0.2 * s.n)
      const degs = Array.from(g.degree).sort((a, b) => b - a)
      const topEdges = degs.slice(0, count).reduce((a, b) => a + b, 0)
      const avgEdgesRandom = (count * (2 * total)) / s.n
      const red = (v: VariantResult) => (none.stats.cumulative.mean > 0 ? (1 - v.stats.cumulative.mean / none.stats.cumulative.mean) * 100 : 0)
      return {
        interpretation: [
          `Vaccinating a vertex removes all of its incident edges from the set of possible transmission routes. Vaccinating the ${count} highest-degree vertices touches about ${topEdges} edge endpoints, versus roughly ${avgEdgesRandom.toFixed(0)} for ${count} random vertices (the graph has ${total} edges).`,
          `Degree centrality C_D(v) = deg(v)/(n − 1) ranks vertices by how many contacts they have. In a scale-free graph the degree distribution is heavy-tailed, so a small group of hubs carries a large share of all edges, and the second moment ⟨k²⟩, which governs R₀, drops sharply when they are removed.`,
          `Mean infections: none ${none.stats.cumulative.mean.toFixed(0)}, random ${rnd.stats.cumulative.mean.toFixed(0)}, targeted ${tgt.stats.cumulative.mean.toFixed(0)}. Reduction versus baseline: random ${red(rnd).toFixed(0)}%, targeted ${red(tgt).toFixed(0)}%.`,
        ],
        conclusion:
          red(tgt) > red(rnd)
            ? `With identical vaccine supply, targeting hubs cut infections by ${red(tgt).toFixed(0)}% against ${red(rnd).toFixed(0)}% for random vaccination. On heterogeneous networks, knowing who is highly connected is worth more than vaccinating more people at random.`
            : `In this sample targeted vaccination was not better than random (${red(tgt).toFixed(0)}% vs ${red(rnd).toFixed(0)}%). With a hub among the initial infections or with few runs this can happen; raise the number of runs.`,
      }
    },
  },
  {
    id: 'topology',
    title: 'Small-world vs random vs scale-free',
    blurb: 'Same parameters, three network structures',
    objective: 'See how the way connections are arranged, not only how many there are, shapes epidemic dynamics.',
    changed: ['Network model: Erdős–Rényi, Watts–Strogatz (rewiring 0.1), Barabási–Albert'],
    constant: (s) => [
      `n = ${s.n}, average degree ⟨k⟩ = 6`,
      'β = 0.08, γ = 0.20, 3 initially infected, same seed',
    ],
    build: (s) =>
      (
        [
          ['er', 'Random'],
          ['ws', 'Small-world'],
          ['ba', 'Scale-free'],
        ] as const
      ).map(([type, label]) => ({
        id: type,
        label,
        config: baseConfig(s, { type, avgDegree: 6, rewireP: 0.1 }),
      })),
    interpret: (res, s) => {
      const stats = res.map((r) => graphStats(r.graph))
      const r0 = res.map((r) => estimateR0(r.config.beta, r.config.gamma, graphStats(r.graph)))
      const peak = res.map((r) => r.stats.peak.mean)
      const ar = res.map((r) => r.stats.attackRate.mean)
      return {
        interpretation: [
          `All three graphs have n = ${s.n} and similar ⟨k⟩ (${stats.map((x) => x.avgDegree.toFixed(2)).join(', ')}), but different second moments ⟨k²⟩ = ${stats.map((x) => x.secondMoment.toFixed(1)).join(', ')}. Since R₀ ≈ T(⟨k²⟩ − ⟨k⟩)/⟨k⟩, the estimates are ${r0.map((x) => x.toFixed(2)).join(', ')} for random, small-world and scale-free.`,
          `The small-world graph has high clustering (${stats[1].clustering.toFixed(2)} vs ${stats[0].clustering.toFixed(2)} for random): many of a person's contacts also know each other, so transmissions are redundant, while its few long-range shortcuts keep the average path short (${stats[1].avgPathLength.toFixed(1)} steps).`,
          `Mean peak infected: ${peak.map((x) => x.toFixed(0)).join(', ')}. Mean attack rate: ${ar.map((x) => pct(x)).join(', ')}.`,
        ],
        conclusion: (() => {
          const names = ['random', 'small-world', 'scale-free']
          const hi = r0.indexOf(Math.max(...r0))
          const hiPeak = peak.indexOf(Math.max(...peak))
          return `Topology changes the dynamics at equal average degree. The ${names[hi]} network has the highest R₀ estimate (${r0[hi].toFixed(2)}), and the ${names[hiPeak]} network reached the highest mean peak (${peak[hiPeak].toFixed(0)} infected). Mean attack rates were ${ar.map((x, i) => `${pct(x)} (${names[i]})`).join(', ')}.`
        })(),
      }
    },
  },
  {
    id: 'transmission',
    title: 'Effect of transmission probability',
    blurb: 'Sweep β from 0.01 to 0.20',
    objective: 'Observe how cumulative infection depends on β and where the epidemic threshold lies.',
    changed: ['Transmission probability β per active contact: 0.01 … 0.20'],
    constant: (s) => [
      `Erdős–Rényi network, n = ${s.n}, ⟨k⟩ = 6, same graph for every β`,
      'γ = 0.20, 3 initially infected, same seed',
    ],
    xLabel: 'Transmission probability β',
    build: (s) =>
      [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.15, 0.2].map((b) => ({
        id: `b${b}`,
        label: `β = ${b.toFixed(2)}`,
        x: b,
        config: baseConfig(s, { type: 'er', avgDegree: 6, beta: b }),
      })),
    interpret: (res, s) => {
      const g = generateGraph(res[0].config.network)
      const st = graphStats(g)
      // Threshold: T_c = <k>/(<k^2> - <k>) = 1/excessDegree ; solve beta/(beta+gamma-beta*gamma) = T_c for beta.
      const gam = 0.2
      const tc = st.excessDegree > 0 ? 1 / st.excessDegree : 1
      const betaC = (tc * gam) / (1 - tc * (1 - gam))
      const ar = res.map((r) => r.stats.attackRate.mean)
      return {
        interpretation: [
          `Epidemic threshold: an outbreak is possible when R₀ = T·(⟨k²⟩ − ⟨k⟩)/⟨k⟩ > 1. For this graph (⟨k⟩ = ${st.avgDegree.toFixed(2)}, ⟨k²⟩ = ${st.secondMoment.toFixed(1)}) that requires T > ${tc.toFixed(3)}, which with γ = ${gam} corresponds to β ≳ ${betaC.toFixed(3)}.`,
          `Below that value the mean attack rate stays near ${pct(ar[0])}–${pct(ar[2])}; above it infections increase steeply and then saturate toward the size of the connected component (${pct(st.largestComponent / s.n)} of the population).`,
          `Measured mean attack rate: ${res.map((r, i) => `β=${(r.config.beta).toFixed(2)}: ${pct(ar[i])}`).join(', ')}.`,
        ],
        conclusion: `Cumulative infection is not proportional to β. Mean attack rate was ${pct(ar[0])} at β = ${res[0].config.beta.toFixed(2)}, ${pct(ar[Math.floor(ar.length / 2)])} at β = ${res[Math.floor(ar.length / 2)].config.beta.toFixed(2)} and ${pct(ar[ar.length - 1])} at β = 0.20. The calculated threshold β ≈ ${betaC.toFixed(3)} marks where the curve leaves the near-zero region.`,
      }
    },
  },
  {
    id: 'distancing',
    title: 'Impact of social distancing',
    blurb: 'Deactivate 0, 30, 50 or 70% of contacts',
    objective: 'Understand how deleting edges of the contact graph changes the transmission network and the outcome.',
    changed: ['Share of edges deactivated from day 0: 0%, 30%, 50%, 70%'],
    constant: (s) => [
      `Erdős–Rényi network, n = ${s.n}, ⟨k⟩ = 8, same graph and same removed-edge draw per run`,
      'β = 0.08, γ = 0.20, 3 initially infected, same seed',
    ],
    build: (s) =>
      [0, 30, 50, 70].map((p) => ({
        id: `d${p}`,
        label: p === 0 ? 'No distancing' : `${p}% fewer contacts`,
        x: p,
        config: baseConfig(s, {
          type: 'er',
          avgDegree: 8,
          interventions: withEnabled({ ...DEFAULT_INTERVENTIONS, distancing: { enabled: true, pct: p, startDay: 0 } }, p === 0 ? [] : ['distancing']),
        }),
      })),
    interpret: (res) => {
      const ar = res.map((r) => r.stats.attackRate.mean)
      const T = transmissibility(0.08, 0.2)
      const full = res[0].graph
      const st = graphStats(full)
      const keep = [1, 0.7, 0.5, 0.3]
      const r0 = keep.map((k) => T * k * st.avgDegree) // random edge deletion thins a Poisson degree distribution: R0 scales with the kept fraction
      return {
        interpretation: [
          `Deactivating a fraction f of the edges leaves a random subgraph whose average degree is (1 − f)⟨k⟩, from ${st.avgDegree.toFixed(1)} down to ${(0.3 * st.avgDegree).toFixed(1)}. For this near-Poisson graph R₀ ≈ T·(1 − f)·⟨k⟩ = ${r0.map((x) => x.toFixed(2)).join(', ')} for f = 0, 30, 50, 70%.`,
          `At 70% the graph also fragments into many small components, which no infection can cross, so the limit comes from connectivity as well as from slower spread.`,
          `Measured mean attack rate: ${ar.map((x) => pct(x)).join(' → ')}; share of runs with an outbreak above 10%: ${res.map((r) => `${r.stats.majorOutbreakPct.toFixed(0)}%`).join(' → ')}.`,
        ],
        conclusion: `Cutting contacts shrinks the transmission network. Attack rate fell from ${pct(ar[0])} with no distancing to ${pct(ar[3])} at 70% fewer contacts, and an outbreak above 10% of the population occurred in ${res[0].stats.majorOutbreakPct.toFixed(0)}% of runs without distancing against ${res[3].stats.majorOutbreakPct.toFixed(0)}% at 70%.`,
      }
    },
  },
]
