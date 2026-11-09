import type { ReactNode } from 'react'
import { Formula, M } from '../components/ui'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-[26px] leading-8 tracking-[-0.01em]">{title}</h2>
      <div className="mt-4 max-w-3xl space-y-3 text-[15px] leading-[26px] text-ink2">{children}</div>
    </section>
  )
}

const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="space-y-2">
    {items.map((it, i) => (
      <li key={i} className="flex gap-3">
        <span className="mt-[11px] size-1 shrink-0 rounded-full bg-ink3" />
        <span>{it}</span>
      </li>
    ))}
  </ul>
)

export function About() {
  return (
    <div>
      <header className="rise mb-10 max-w-3xl">
        <h1 className="font-serif text-[34px] leading-[1.15] font-normal tracking-[-0.02em]">About the project</h1>
        <p className="mt-2 text-[15px] leading-[22px] text-ink2">
          Breaking the Chain is a project-based learning piece for Discrete Mathematical Structures. It asks whether graph theory can help us understand, predict and control the spread of an epidemic, and answers by running the mathematics.
        </p>
      </header>

      <div className="rise-2 space-y-10">
        <Block title="Why this is a graph problem">
          <p>
            An infection passes between people who are in contact, so the population is naturally a graph: individuals are vertices and possible contacts are edges. Questions about spread become questions about structure. Which people have many contacts? Which groups are cut off from each other? How many steps separate two people?
          </p>
          <p>
            Vaccination deletes vertices, distancing deletes edges and isolation switches a vertex's edges off for a while. Time advances in whole days, so the epidemic is a discrete-time stochastic process on a fixed discrete structure.
          </p>
        </Block>

        <Block title="What the engine implements">
          <p>
            <span className="text-ink">Networks.</span> Erdős–Rényi <M>G(n, p)</M> with <M>p = ⟨k⟩/(n−1)</M>. Watts–Strogatz: a ring lattice of <M>k</M> nearest neighbours with each edge's far end rewired with probability <M>p_rewire</M>, without self-loops or duplicates. Barabási–Albert: a clique of <M>m+1</M> vertices, then each new vertex attaches to <M>m</M> distinct existing vertices chosen proportionally to degree, by sampling from the list of edge endpoints.
          </p>
          <p>
            <span className="text-ink">One day of SIR.</span> From the state at the start of the day, every infectious, non-isolated vertex tries each active edge to a susceptible neighbour with probability β, and every infectious vertex recovers with probability γ. Both sets of changes are applied together, so a vertex infected today first transmits tomorrow. A susceptible vertex with k infectious neighbours is infected with probability <M>1 − (1 − β)<sup>k</sup></M>, which the per-contact trials realise exactly.
          </p>
          <Formula>
            T = β / (β + γ − βγ){'\n'}R₀ ≈ T · (⟨k²⟩ − ⟨k⟩) / ⟨k⟩{'\n'}Reduction (%) = (baseline − intervention) / baseline × 100
          </Formula>
          <p>
            T is the probability that an infected vertex ever transmits across one particular edge during its geometric infectious period. R₀ follows from bond percolation on a configuration-model network (Newman, 2002) and is shown as an estimate: it is accurate for large, uncorrelated networks and rougher for small ones with strong clustering. The outbreak threshold is R₀ = 1.
          </p>
          <p>
            <span className="text-ink">Interventions.</span> Random vaccination samples eligible vertices uniformly. Targeted vaccination takes the eligible vertices of highest degree (degree centrality), ties broken by id. Social distancing deactivates a uniformly random share of the edges from a chosen day. Isolation detects infected vertices after a delay (with a per-day detection probability) and deactivates all their edges for a set period; afterwards they rejoin if still infectious, and recovered individuals stay recovered. Initial infected individuals are never vaccinated.
          </p>
          <p>
            <span className="text-ink">Reproducibility.</span> A seeded generator (mulberry32) drives everything. The graph and the initially infected set depend only on the seed. Separate streams drive transmission, vaccination, distancing and isolation, so scenarios sharing a seed start from the same population and the same cases. Repeated runs change only the stochastic stream.
          </p>
        </Block>

        <Block title="Invariants and validation">
          <p>The engine checks itself. The status line under the live network reports these invariants from the current state, and the test suite asserts them over many random configurations.</p>
          <List
            items={[
              <>S(t) + I(t) + R(t) = N on every day, and every individual is in exactly one state.</>,
              <>No individual is infected twice. Recovered and vaccinated individuals are never infected.</>,
              <>Every infection has a logged source that was infectious on the previous day, joined to the target by a real edge.</>,
              <>No transmission crosses a distanced edge, and no isolated individual transmits.</>,
              <>Secondary-infection counts, cumulative infections and the transmission log agree.</>,
              <>Zero transmission probability produces no new infections. Recovery probability 1 clears everyone infected at the start of a step. With no edges the infection cannot spread.</>,
              <>Generated graphs are simple, adjacency matrices are symmetric with row sums equal to degrees, and the degree sum is 2|E|.</>,
              <>Targeted vaccination always selects the highest-degree eligible vertices. Scenario comparison reports a 0% reduction when the baseline has no infections.</>,
            ]}
          />
          <p>
            Run <M>npm test</M> to execute them.
          </p>
        </Block>

        <Block title="Assumptions and limitations">
          <List
            items={[
              <>This is an educational mathematical model, not a clinical or epidemiological prediction tool. It does not forecast any real outbreak and must not be used for medical or public-health decisions.</>,
              <>The contact graph is fixed and unweighted. Real contacts change over time and differ in intensity and duration.</>,
              <>Every infected person is equally infectious. There is no incubation period, no asymptomatic spread, no age or risk structure, no reinfection and no waning immunity.</>,
              <>Vaccination is perfect and instant, applied before day 0. Real vaccines are partial and take time.</>,
              <>Detection and isolation are idealised: isolated people make no contacts at all, and detection is a simple delay with a fixed probability.</>,
              <>The three generators are textbook models. The scale-free network has hubs by construction; real networks sit somewhere between these extremes.</>,
              <>The R₀ estimate assumes a large, uncorrelated network. Small populations, clustering and the first few steps of an outbreak deviate from it. Results from a single stochastic run can differ from the average, which is why comparison and the lab repeat runs.</>,
              <>The interface limits populations to 1,000 so that every simulation runs comfortably in the browser.</>,
            ]}
          />
        </Block>

        <Block title="Architecture">
          <p>
            The simulation engine in <M>src/engine</M> is plain TypeScript with no React or DOM dependency: <M>graphGenerator</M>, <M>graphAnalysis</M>, <M>transmissionEngine</M>, <M>interventionEngine</M>, <M>epidemicModel</M>, <M>metricsCalculator</M>, <M>randomGenerator</M> and <M>experimentRunner</M>. Each scenario owns one authoritative <M>Simulation</M> object. The interface only reads from it: the network canvas, charts, metrics and tables are all derived from the simulation state and its history.
          </p>
          <p>
            Interface timers are tied to a single effect keyed on the running flag, the simulation and the speed, so rapid start, pause, reset and speed changes cancel any earlier timer. Long comparisons and experiments run in chunks and yield to the browser, and a newer run supersedes an older one.
          </p>
        </Block>
      </div>
    </div>
  )
}
