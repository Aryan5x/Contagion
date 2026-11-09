# Breaking the Chain

Modelling and controlling epidemic spread through graph theory. An interactive simulator for a Discrete Mathematical Structures project: a stochastic SIR epidemic runs on random, small-world and scale-free contact graphs, and vaccination, distancing and isolation are tested on the same network.

Everything runs in the browser. There is no backend, no account and no API key.

> **Educational model.** This is a mathematical model for teaching. It is not a clinical or epidemiological prediction tool and must not be used for medical or public-health decisions.

## Run it

```bash
npm install
npm run dev
```

Then open the address Vite prints (http://localhost:5173).

```bash
npm test          # engine test suite (vitest)
npm run typecheck # TypeScript
npm run build     # production build in dist/
```

Requires Node 18 or newer.

## What is in the app

| Page | What it does |
| --- | --- |
| Overview | Live miniature epidemic on the real engine, plus a result computed on load (random vs targeted vaccination) |
| Live simulation | Start, pause, resume, step, reset, speed, new network. Animated graph, S/I/R chart, new-infection chart, metrics, transmission log, node inspector |
| Network explorer | Generate and measure networks: vertices, edges, degrees, density, components, clustering, path length, degree distribution, hubs, side-by-side model table |
| Interventions | Random and targeted vaccination, social distancing, isolation. Shows the original and the reduced contact graph |
| Scenario comparison | No intervention, random vaccination, targeted vaccination, distancing, isolation and custom combinations on the same graph and seed, with replay |
| Experiment lab | Five experiments with repeated runs, mean ± sd, interpretation and conclusion generated from the results |
| Mathematical concepts | Definitions, formulas and epidemic relevance, with interactive adjacency matrix, BFS/DFS visualiser and shortest-path vs actual-infection-route demo |
| About the project | Algorithms, invariants, assumptions and limitations |

Keyboard shortcuts on the live page: `Space` start/pause, `N` or `→` step, `R` reset.

## Architecture

```
src/engine/            Pure TypeScript, no React or DOM
  randomGenerator.ts   Seeded mulberry32 RNG, hash-derived independent streams
  graphGenerator.ts    Erdős–Rényi, Watts–Strogatz, Barabási–Albert
  graphAnalysis.ts     Degrees, density, components, adjacency matrix, centrality, BFS, DFS, shortest path, R0 estimate
  transmissionEngine.ts  One synchronous round of transmission and recovery
  interventionEngine.ts  Vaccination, distancing and isolation rules
  epidemicModel.ts     Simulation: the single authoritative state of one scenario
  metricsCalculator.ts Metrics, aggregation, invariant checker
  experimentRunner.ts  Replicates, scenario comparison
  experiments.ts       The five experiment definitions and their written interpretation
src/components/        Network canvas, charts, shared UI
src/pages/             The eight pages
src/state/workspace.tsx  Shared configuration, graph, live simulation and timers
tests/engine.test.ts   Engine tests
```

The interface only reads from the engine. Colours on the canvas, chart series, tables and conclusions are all derived from `Simulation` objects and their history. Long comparisons and experiments run in small chunks and yield to the browser; a newer run supersedes an older one.

## Mathematics

**Population.** An undirected simple graph `G = (V, E)`. Vertices are individuals and edges are possible contacts. `⟨k⟩ = 2|E|/|V|`, density `= 2|E| / (|V|(|V|−1))`, degree centrality `C_D(v) = deg(v) / (|V|−1)`.

**Networks.**

- Erdős–Rényi `G(n, p)` with `p = ⟨k⟩/(n−1)`: every pair is an edge independently with probability `p`.
- Watts–Strogatz: ring lattice with `k/2` neighbours on each side, then each lattice edge has its far end rewired with probability `p_rewire` (no self-loops or duplicates).
- Barabási–Albert: a clique of `m+1` vertices, then each new vertex attaches to `m` distinct existing vertices with probability proportional to degree (sampling from the list of edge endpoints).

**One day of SIR.** All decisions use the state at the start of the day.

1. Each infectious, non-isolated vertex tries every active edge to a susceptible neighbour with probability `β`. A susceptible vertex with `k` infectious neighbours is therefore infected with probability `1 − (1 − β)^k`.
2. Each infectious vertex recovers with probability `γ`.
3. Both sets of changes are committed together, so a vertex infected today first transmits tomorrow.
4. Isolation is evaluated on the new state.

**Threshold.** An infected vertex with geometric infectious period transmits across a given edge with probability `T = β / (β + γ − βγ)`. On a configuration-model network `R₀ ≈ T (⟨k²⟩ − ⟨k⟩) / ⟨k⟩` (Newman 2002), and an outbreak needs `R₀ > 1`. The app shows this as an estimate computed from the generated graph.

**Interventions.**

- Random vaccination: a uniform sample of eligible vertices (not initially infected) is made immune before day 0.
- Targeted vaccination: the eligible vertices with the highest degree, ties broken by id.
- Social distancing: a uniform random share of edges is deactivated from a chosen day.
- Isolation: infected vertices are detected after a delay (with a per-day detection probability) and all their edges are deactivated for a set period. Afterwards they rejoin if still infectious; recovered individuals stay recovered.

**Comparison.** `Reduction (%) = (baseline − intervention) / baseline × 100`, reported as 0 when the baseline is 0.

**Reproducibility.** The graph and the initially infected set depend only on the seed. Transmission, vaccination, distancing and isolation use separate streams derived from the seed and the replicate number, so scenarios sharing a seed start from the same population and cases; extra runs vary only the stochastic stream.

## Invariants checked by the engine

The live page shows `S + I + R = N` and an "invariants hold" indicator computed from the current state. The test suite asserts:

- `S(t) + I(t) + R(t) = N` on every day, each vertex in exactly one state
- no vertex infected twice; recovered and vaccinated vertices never infected
- every infection has a logged source that was infectious the previous day, joined by a real edge
- no transmission over a distanced edge or from an isolated vertex
- `β = 0` gives no infections; `γ = 1` clears everyone infected at the start of a step; no edges means no spread
- generated graphs are simple, adjacency matrices are symmetric with row sums equal to degrees
- targeted vaccination picks the highest-degree eligible vertices
- scenarios sharing a seed start from the same infected set and run independently

## Assumptions and limitations

Fixed, unweighted contact graph; identical infectiousness; no incubation, asymptomatic spread, age structure, reinfection or waning immunity; perfect instant vaccination; idealised detection and isolation; textbook network generators; populations capped at 1,000 in the interface. Single stochastic runs vary, so comparisons and experiments repeat runs and report averages with spread.

## Stack

React, TypeScript, Vite, Tailwind CSS v4, Recharts, d3-force (layout only), lucide-react icons, Vitest. The network is drawn on a canvas, and the layout never influences the simulation.
