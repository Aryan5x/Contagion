import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_INTERVENTIONS,
  Simulation,
  computeMetrics,
  enabledKeys,
  estimateR0,
  generateGraph,
  graphStats,
  randomSeed,
  validateSpec,
  withEnabled,
} from '../engine'
import type { Graph, GraphStats, InterventionConfig, Metrics, NetworkSpec, ScenarioResult, SimConfig, VariantResult } from '../engine'
import { useLayout } from '../components/useLayout'

export const DEFAULT_CONFIG: SimConfig = {
  network: { type: 'ba', n: 250, avgDegree: 6, rewireP: 0.1, seed: 42 },
  initialInfected: 3,
  beta: 0.08,
  gamma: 0.12,
  interventions: DEFAULT_INTERVENTIONS,
  maxDays: 365,
}

export const SPEEDS = [1, 2, 4, 8, 16] as const

export interface ComparisonState {
  signature: string
  results: ScenarioResult[]
  runs: number
}

export interface Workspace {
  config: SimConfig
  setNetwork: (patch: Partial<NetworkSpec>) => void
  setParams: (patch: Partial<Pick<SimConfig, 'initialInfected' | 'beta' | 'gamma'>>) => void
  setInterventions: (next: InterventionConfig) => void
  graph: Graph
  stats: GraphStats
  r0: number
  positions: Float32Array
  sim: Simulation
  /** The same epidemic (same network, seed and cases) with every intervention off, run to its end; null if none is on. */
  baseline: Simulation | null
  guideOpen: boolean
  setGuideOpen: (v: boolean) => void
  codes: Uint8Array
  metrics: Metrics
  version: number
  running: boolean
  speed: number
  setSpeed: (s: number) => void
  start: () => void
  pause: () => void
  stepOnce: () => void
  reset: () => void
  newNetwork: () => void
  error: string | null
  comparison: ComparisonState | null
  setComparison: (c: ComparisonState | null) => void
  experiments: Record<string, { signature: string; results: VariantResult[] }>
  setExperiment: (id: string, v: { signature: string; results: VariantResult[] } | null) => void
}

const Ctx = createContext<Workspace | null>(null)

export function useWorkspace(): Workspace {
  const w = useContext(Ctx)
  if (!w) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return w
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG)
  const [resetKey, setResetKey] = useState(0)
  const [version, setVersion] = useState(0)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState<number>(2)
  const [guideOpen, setGuideOpen] = useState(true)
  const [comparison, setComparison] = useState<ComparisonState | null>(null)
  const [experiments, setExperiments] = useState<Workspace['experiments']>({})

  // The graph depends on the network parameters only, so changing beta or an intervention keeps the same population.
  const netKey = JSON.stringify(config.network)
  const { graph, error } = useMemo(() => {
    const spec = JSON.parse(netKey) as NetworkSpec
    const err = validateSpec(spec)
    if (err) return { graph: generateGraph({ ...spec, n: 20, avgDegree: 4 }), error: err }
    return { graph: generateGraph(spec), error: null as string | null }
  }, [netKey])
  const stats = useMemo(() => graphStats(graph), [graph])
  const positions = useLayout(graph)
  const r0 = estimateR0(config.beta, config.gamma, stats)

  // One authoritative simulation per (graph, config, reset). Rebuilding discards all earlier state.
  const sim = useMemo(
    () => new Simulation(graph, config, { recordFrames: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, config, resetKey],
  )
  useEffect(() => {
    setRunning(false)
    setVersion((v) => v + 1)
  }, [sim])

  // "What if we did nothing?" The same replicate (same random stream) with all interventions removed.
  const baseline = useMemo(() => {
    if (enabledKeys(config.interventions).length === 0) return null
    return new Simulation(graph, { ...config, interventions: withEnabled(config.interventions, []) }).runToEnd()
  }, [graph, config])

  const metrics = useMemo(() => computeMetrics(sim), [sim, version])
  const codes = useMemo(() => sim.displayCodes(), [sim, version])

  // Single timer, tied to (running, sim, speed): any change cancels the previous timer first.
  const runningRef = useRef(running)
  runningRef.current = running
  useEffect(() => {
    if (!running) return
    const delay = 1000 / speed
    let id = 0
    const loop = () => {
      if (!sim.step()) {
        setRunning(false)
        return
      }
      setVersion((v) => v + 1)
      if (sim.isFinished()) {
        setRunning(false)
        return
      }
      id = window.setTimeout(loop, delay)
    }
    id = window.setTimeout(loop, delay)
    return () => window.clearTimeout(id)
  }, [running, sim, speed])

  const setNetwork = useCallback((patch: Partial<NetworkSpec>) => {
    setConfig((c) => {
      const network = { ...c.network, ...patch }
      network.n = clamp(Math.round(network.n), 20, 1000)
      network.avgDegree = clamp(network.avgDegree, 1, Math.min(30, network.n - 1))
      network.rewireP = clamp(network.rewireP, 0, 1)
      return { ...c, network, initialInfected: Math.min(c.initialInfected, network.n) }
    })
  }, [])
  const setParams = useCallback((patch: Partial<Pick<SimConfig, 'initialInfected' | 'beta' | 'gamma'>>) => {
    setConfig((c) => ({
      ...c,
      ...patch,
      initialInfected: clamp(Math.round(patch.initialInfected ?? c.initialInfected), 1, c.network.n),
    }))
  }, [])
  const setInterventions = useCallback((interventions: InterventionConfig) => setConfig((c) => ({ ...c, interventions })), [])

  const value: Workspace = {
    config,
    setNetwork,
    setParams,
    setInterventions,
    graph,
    stats,
    r0,
    positions,
    sim,
    baseline,
    guideOpen,
    setGuideOpen,
    codes,
    metrics,
    version,
    running,
    speed,
    setSpeed,
    start: () => {
      if (!sim.isFinished()) setRunning(true)
    },
    pause: () => setRunning(false),
    stepOnce: () => {
      setRunning(false)
      if (sim.step()) setVersion((v) => v + 1)
    },
    reset: () => {
      setRunning(false)
      setResetKey((k) => k + 1)
    },
    newNetwork: () => {
      setRunning(false)
      setNetwork({ seed: randomSeed() })
    },
    error,
    comparison,
    setComparison,
    experiments,
    setExperiment: (id, v) =>
      setExperiments((prev) => {
        const next = { ...prev }
        if (v) next[id] = v
        else delete next[id]
        return next
      }),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
