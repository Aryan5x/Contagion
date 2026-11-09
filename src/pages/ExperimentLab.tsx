import { useEffect, useMemo, useRef, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { graphStats, runVariants } from '../engine'
import type { VariantResult } from '../engine'
import { DEFAULT_EXPERIMENT_SETTINGS, EXPERIMENTS } from '../engine/experiments'
import type { ExperimentDef, ExperimentId, ExperimentSettings } from '../engine/experiments'
import { useWorkspace } from '../state/workspace'
import { AttackBars, CurvesChart, SeriesLegend, XYBand } from '../components/charts'
import { Btn, NumberField, Panel, SliderField, cx, fmtNum, fmtPct } from '../components/ui'
import { SERIES } from '../theme'

export function ExperimentLab() {
  const w = useWorkspace()
  const [id, setId] = useState<ExperimentId>('connectivity')
  const [settings, setSettings] = useState<ExperimentSettings>(DEFAULT_EXPERIMENT_SETTINGS)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const token = useRef(0)
  const def = EXPERIMENTS.find((e) => e.id === id)!
  const signature = JSON.stringify([id, settings])
  const stored = w.experiments[id]
  const stale = !!stored && stored.signature !== signature

  const run = async (d: ExperimentDef = def, s: ExperimentSettings = settings) => {
    const my = ++token.current
    const sig = JSON.stringify([d.id, s])
    setProgress({ done: 0, total: 1 })
    const specs = d.build(s)
    const res = await runVariants(
      specs,
      s.runs,
      (done, total) => token.current === my && setProgress({ done, total }),
      () => token.current !== my,
    )
    if (token.current !== my) return
    setProgress(null)
    if (res) w.setExperiment(d.id, { signature: sig, results: res })
  }

  // Run an experiment the first time it is opened. Results are kept when navigating away.
  useEffect(() => {
    if (!w.experiments[id]) void run()
    return () => {
      token.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <div>
      <header className="rise mb-8 max-w-3xl">
        <h1 className="font-serif text-[34px] leading-[1.15] font-normal tracking-[-0.02em]">Experiment lab</h1>
        <p className="mt-2 text-[15px] leading-[22px] text-ink2">
          Five controlled experiments. Each changes one thing, keeps the rest fixed and repeats every run with different random draws, so conclusions come from averages and spread, not from a single lucky outcome.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav aria-label="Experiments" className="rise-2 space-y-1 lg:sticky lg:top-0 lg:self-start">
          {EXPERIMENTS.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setId(e.id)}
              aria-current={e.id === id ? 'true' : undefined}
              className={cx(
                'flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150',
                e.id === id ? 'bg-raised shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'hover:bg-raised/60',
              )}
            >
              <span className="tnum mt-0.5 font-mono text-[13px] text-ink3">{i + 1}</span>
              <span>
                <span className={cx('block text-[14px] leading-5', e.id === id ? 'text-ink' : 'text-ink2')}>{e.title}</span>
                <span className="mt-0.5 block text-[13px] leading-4 text-ink3">{e.blurb}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="rise-3 min-w-0 space-y-4">
          <Panel>
            <h2 className="font-serif text-[26px] leading-8 tracking-[-0.01em]">{def.title}</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-3">
              <div>
                <dt className="text-[13px] text-ink3">Objective</dt>
                <dd className="mt-1 text-[14px] leading-5 text-ink2">{def.objective}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink3">Changed</dt>
                <dd className="mt-1 text-[14px] leading-5 text-ink">
                  <ul className="space-y-1">{def.changed.map((c) => <li key={c}>{c}</li>)}</ul>
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink3">Kept constant</dt>
                <dd className="mt-1 text-[14px] leading-5 text-ink2">
                  <ul className="space-y-1">{def.constant(settings).map((c) => <li key={c}>{c}</li>)}</ul>
                </dd>
              </div>
            </dl>
            <div className="mt-5 grid items-end gap-x-8 gap-y-2 border-t border-line pt-4 md:grid-cols-[1fr_1fr_auto_auto]">
              <SliderField label="Runs per variant" value={settings.runs} min={5} max={100} step={5} onChange={(runs) => setSettings((s) => ({ ...s, runs }))} hint="Each run keeps the graph and the initial cases fixed and changes only the random draws." />
              <SliderField label="Population" value={settings.n} min={100} max={600} step={50} onChange={(n) => setSettings((s) => ({ ...s, n }))} />
              <NumberField label="Seed" value={settings.seed} min={0} max={999999} onChange={(seed) => setSettings((s) => ({ ...s, seed: Math.max(0, Math.round(seed)) }))} />
              <Btn variant="primary" onClick={() => run()} disabled={progress !== null}>
                <FlaskConical size={16} strokeWidth={1.5} />
                {progress ? 'Running…' : stored ? 'Run again' : 'Run experiment'}
              </Btn>
            </div>
          </Panel>

          {stale && !progress && (
            <div className="rounded-xl border border-line-strong bg-raised px-4 py-2.5 text-[13px] text-ink2">
              The settings changed after these results were produced. Run again to update them.
            </div>
          )}

          {!stored && <div className="rounded-2xl border border-line bg-card p-10 text-center text-ink3">{progress ? `Running ${def.build(settings).length} variants × ${settings.runs} runs…` : 'No results yet.'}</div>}
          {stored && <Results def={def} settings={settings} results={stored.results} signature={stored.signature} />}
        </div>
      </div>
    </div>
  )
}

function Results({ def, settings, results }: { def: ExperimentDef; settings: ExperimentSettings; results: VariantResult[]; signature: string }) {
  // Use the settings the results were actually produced with for the narrative.
  const used = useMemo<ExperimentSettings>(() => {
    const first = results[0]
    return { n: first.graph.n, runs: first.stats.runs, seed: first.config.network.seed }
  }, [results])
  void settings
  const text = useMemo(() => def.interpret(results, used), [def, results, used])
  const specs = useMemo(() => def.build(used), [def, used])

  const isSweep = def.xLabel !== undefined
  const curveVariants = isSweep ? [3, 5, 7, 9].map((i) => results[i]).filter(Boolean) : results

  const thresholdBeta = useMemo(() => {
    if (def.id !== 'transmission') return undefined
    const st = graphStats(results[0].graph)
    const gam = results[0].config.gamma
    const tc = st.excessDegree > 0 ? 1 / st.excessDegree : 1
    return (tc * gam) / (1 - tc * (1 - gam))
  }, [def.id, results])

  return (
    <>
      <p className="rounded-xl border border-line bg-card px-4 py-3 text-[13px] leading-5 text-ink2">
        <span className="text-ink">How to read these charts. </span>
        {isSweep
          ? 'Each point is the average over all runs at one transmission probability; the band shows how much runs differ. The dashed line marks the threshold where one case infects one other person on average (R₀ = 1).'
          : 'Left: how many people are infected at the same time on each day, averaged over the runs, with a faint band for the spread. Right: the share of the whole population that was infected at some point.'}
      </p>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title={isSweep ? 'Infected over time for selected β' : 'Infected over time'} aside={<span>mean ± 1 sd of {used.runs} runs</span>}>
          <CurvesChart variants={curveVariants} height={300} maxDay={100} />
          <div className="mt-3">
            <SeriesLegend items={curveVariants} />
          </div>
        </Panel>
        <Panel title={isSweep ? 'Attack rate against β' : 'Attack rate'} aside={<span>mean ± sd</span>}>
          {isSweep ? (
            <XYBand
              points={results.map((r, i) => ({ x: specs[i]?.x ?? i, mean: r.stats.attackRate.mean, sd: r.stats.attackRate.sd }))}
              xLabel={def.xLabel!}
              height={300}
              threshold={thresholdBeta && thresholdBeta < 0.2 ? thresholdBeta : undefined}
            />
          ) : (
            <AttackBars items={results.map((r) => ({ label: r.label, mean: r.stats.attackRate.mean, sd: r.stats.attackRate.sd }))} height={300} />
          )}
        </Panel>
      </div>

      <Panel title="Simulation results" aside={<span>N = {used.n}</span>} pad={false}>
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead className="text-ink3">
              <tr className="border-b border-line">
                {['Variant', 'Attack rate', 'Total infected', 'Peak infected', 'Peak day', 'Outbreaks above 10%'].map((h, i) => (
                  <th key={h} className={cx('px-2 py-2.5 font-normal', i > 0 && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tnum font-mono">
              {results.map((r, i) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-2 py-2 font-sans text-ink">
                    {!isSweep && <span className="mr-2 inline-block h-0.5 w-3 rounded align-middle" style={{ background: SERIES[i % SERIES.length] }} />}
                    {r.label}
                  </td>
                  <td className="px-2 py-2 text-right text-ink">{fmtPct(r.stats.attackRate.mean, 1)}<span className="text-ink3"> ±{fmtPct(r.stats.attackRate.sd, 1)}</span></td>
                  <td className="px-2 py-2 text-right text-ink2">{fmtNum(r.stats.cumulative.mean)}<span className="text-ink3"> ±{fmtNum(r.stats.cumulative.sd)}</span></td>
                  <td className="px-2 py-2 text-right text-ink2">{fmtNum(r.stats.peak.mean)}</td>
                  <td className="px-2 py-2 text-right text-ink2">{fmtNum(r.stats.peakDay.mean, 1)}</td>
                  <td className="px-2 py-2 text-right text-ink2">{r.stats.majorOutbreakPct.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Mathematical interpretation">
          <div className="space-y-3 text-[14px] leading-6 text-ink2">
            {text.interpretation.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Panel>
        <Panel title="Conclusion">
          <p className="font-serif text-[19px] leading-[28px] text-ink">{text.conclusion}</p>
          <p className="mt-4 text-[12px] leading-4 text-ink3">Written from the numbers above, so it changes with the settings. This is an educational model, not a clinical prediction.</p>
        </Panel>
      </div>
    </>
  )
}
