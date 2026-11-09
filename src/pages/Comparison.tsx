import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import {
  INTERVENTION_KEYS,
  INTERVENTION_LABEL,
  PRESET_SCENARIOS,
  runScenarios,
  scenarioId,
  configSlug,
  curvesCSV,
  scenarioName,
  variantsCSV,
} from '../engine'
import type { InterventionKey, ScenarioResult, ScenarioSpec } from '../engine'
import { useWorkspace } from '../state/workspace'
import { AttackBars, CurvesChart, SeriesLegend } from '../components/charts'
import { NetworkCanvas } from '../components/NetworkCanvas'
import { Btn, PageHeader, Panel, SliderField, cx, fmtNum, fmtPct } from '../components/ui'
import { SERIES } from '../theme'
import { ExportPanel } from '../components/ExportPanel'
import { downloadText } from '../components/download'

export function Comparison() {
  const w = useWorkspace()
  const { config, graph } = w
  const [selected, setSelected] = useState<ScenarioSpec[]>(PRESET_SCENARIOS)
  const [runs, setRuns] = useState(20)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [builder, setBuilder] = useState<InterventionKey[]>([])
  const token = useRef(0)

  const signature = useMemo(
    () => JSON.stringify({ c: config, runs, s: selected.map((s) => s.id) }),
    [config, runs, selected],
  )
  const data = w.comparison
  const stale = data !== null && data.signature !== signature

  const run = async () => {
    const my = ++token.current
    setBusy({ done: 0, total: selected.length })
    const res = await runScenarios(
      graph,
      config,
      config.interventions,
      selected,
      runs,
      (done, total) => token.current === my && setBusy({ done, total }),
      () => token.current !== my,
    )
    if (token.current !== my) return // a newer run (or unmount) superseded this one
    setBusy(null)
    if (res) w.setComparison({ signature, results: res, runs })
  }

  // Compute once on first visit; later visits show the stored results.
  useEffect(() => {
    if (!w.comparison) void run()
    return () => {
      token.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (spec: ScenarioSpec) =>
    setSelected((cur) => (cur.some((s) => s.id === spec.id) ? cur.filter((s) => s.id !== spec.id) : [...cur, spec]))
  const customSpec: ScenarioSpec | null = builder.length >= 2 ? { id: scenarioId(builder), keys: builder } : null
  const customSelected = customSpec && selected.some((s) => s.id === customSpec.id)

  const results = data?.results ?? []
  const ordered = results
  const curves = ordered.map((r) => ({ id: r.id, label: r.label, curves: r.curves }))

  return (
    <div>
      <PageHeader
        title="Scenario comparison"
        lede={`Every scenario runs on the same network (seed ${config.network.seed}, ${w.stats.edges} edges) with the same initially infected individuals. Each scenario keeps its own independent simulation state.`}
        actions={
          <Btn variant="primary" onClick={run} disabled={busy !== null || selected.length === 0}>
            <Play size={16} strokeWidth={1.5} />
            {busy ? `Running ${busy.done + 1} of ${busy.total}` : 'Run comparison'}
          </Btn>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Panel title="Scenarios">
            <ul className="space-y-1">
              {PRESET_SCENARIOS.map((s) => {
                const on = selected.some((x) => x.id === s.id)
                return (
                  <li key={s.id}>
                    <label className="flex h-9 cursor-pointer items-center gap-3 rounded-lg px-2 text-[14px] transition-colors duration-150 hover:bg-raised">
                      <input type="checkbox" className="size-4 accent-[#efeae0]" checked={on} onChange={() => toggle(s)} />
                      <span className={on ? 'text-ink' : 'text-ink2'}>{scenarioName(s.keys)}</span>
                    </label>
                  </li>
                )
              })}
              {selected
                .filter((s) => !PRESET_SCENARIOS.some((p) => p.id === s.id))
                .map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-[14px] hover:bg-raised">
                      <input type="checkbox" className="size-4 accent-[#efeae0]" checked onChange={() => toggle(s)} />
                      <span className="text-ink">{scenarioName(s.keys)}</span>
                    </label>
                  </li>
                ))}
            </ul>
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 text-[13px] text-ink2">Build a combination</div>
              <div className="flex flex-wrap gap-1.5">
                {INTERVENTION_KEYS.map((k) => {
                  const on = builder.includes(k)
                  return (
                    <button
                      key={k}
                      onClick={() => setBuilder((b) => (on ? b.filter((x) => x !== k) : [...b, k]))}
                      aria-pressed={on}
                      className={cx(
                        'h-8 rounded-lg border px-2.5 text-[13px] transition-colors duration-150',
                        on ? 'border-line-strong bg-raised text-ink' : 'border-line text-ink3 hover:text-ink',
                      )}
                    >
                      {INTERVENTION_LABEL[k]}
                    </button>
                  )
                })}
              </div>
              <Btn className="mt-3 w-full" size="sm" disabled={!customSpec || !!customSelected} onClick={() => customSpec && toggle(customSpec)}>
                {customSelected ? 'Already added' : builder.length < 2 ? 'Pick two or more' : 'Add combination'}
              </Btn>
            </div>
          </Panel>

          <Panel title="How each strategy breaks the chain">
            <dl className="space-y-2.5 text-[13px] leading-5">
              {[
                ['Random vaccination', 'Makes a random share of people immune, removing their contacts at random.'],
                ['Targeted vaccination', 'Makes the best-connected people immune first, removing the most contacts per vaccine.'],
                ['Social distancing', 'Switches off a share of all contacts, so infected people have fewer people to infect.'],
                ['Isolation', 'Detects infected people after a delay and switches off all their contacts for a while.'],
              ].map(([t, d]) => (
                <div key={t}>
                  <dt className="text-ink">{t}</dt>
                  <dd className="text-ink3">{d}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Settings">
            <SliderField
              label="Runs per scenario"
              value={runs}
              min={1}
              max={100}
              step={1}
              onChange={setRuns}
              hint="Replicate 0 is the exact seeded run. More runs repeat it with different random draws (same graph, same initial cases) and report mean ± sd."
            />
            <p className="mt-2 text-[13px] leading-5 text-ink3">
              Intervention strengths come from the Interventions page and disease parameters from the Live simulation (β {config.beta.toFixed(3)}, γ {config.gamma.toFixed(2)}). The no-intervention baseline always runs because reductions are measured against it.
            </p>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-4">
          {stale && !busy && (
            <div className="rounded-xl border border-line-strong bg-raised px-4 py-2.5 text-[13px] text-ink2">
              Settings changed since these results were computed. Run the comparison again to refresh them.
            </div>
          )}
          {!data && <div className="rounded-2xl border border-line bg-card p-10 text-center text-ink3">{busy ? 'Running scenarios…' : 'No results yet.'}</div>}
          {data && (
            <>
              <TakeAway results={ordered} n={graph.n} />
              <ResultsTable results={ordered} runs={data.runs} n={graph.n} />
              <ExportPanel
                items={[
                  { label: 'Results table', title: 'CSV: mean and standard deviation of every statistic per scenario, with the reduction versus the baseline', run: () => downloadText(variantsCSV(ordered), `breaking-the-chain_${configSlug(ordered[0].config)}_comparison_runs${data.runs}.csv`) },
                  { label: 'Daily curves', title: 'CSV: mean susceptible, infected and removed per day for each scenario', run: () => downloadText(curvesCSV(ordered), `breaking-the-chain_${configSlug(ordered[0].config)}_comparison-curves_runs${data.runs}.csv`) },
                ]}
                note={stale ? 'These are the results shown above, from before the settings changed. Run the comparison again to export the new settings.' : `${data.runs} runs per scenario on the same network and seed.`}
              />
              <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <Panel title="Infected over time" aside={<span>mean of {data.runs} run{data.runs > 1 ? 's' : ''}</span>}>
                  <CurvesChart variants={curves} bands={data.runs > 1} height={300} maxDay={120} />
                  <div className="mt-3">
                    <SeriesLegend items={curves} />
                  </div>
                </Panel>
                <Panel title="Attack rate" aside={<span>mean ± sd</span>}>
                  <AttackBars
                    items={ordered.map((r) => ({ label: shortLabel(r), mean: r.stats.attackRate.mean, sd: r.stats.attackRate.sd }))}
                    height={300}
                  />
                </Panel>
              </div>
              <Replay results={ordered} positions={w.positions} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** One paragraph in plain language, written from the measured results. */
function TakeAway({ results, n }: { results: ScenarioResult[]; n: number }) {
  const base = results.find((r) => r.id === 'none')
  const others = results.filter((r) => r.id !== 'none')
  if (!base) return null
  const rate = (r: ScenarioResult) => Math.round(r.stats.attackRate.mean * 100)
  const best = [...others].sort((a, b) => b.reduction - a.reduction)[0]
  const worst = [...others].sort((a, b) => a.reduction - b.reduction)[0]
  return (
    <Panel title="What this shows">
      <p className="text-[14px] leading-6 text-ink2">
        With no intervention, on average <span className="text-ink">{rate(base)}% of the {n} people</span> were infected.
        {best && best.reduction > 0 ? (
          <>
            {' '}The most effective strategy was <span className="text-ink">{best.label}</span>, which brought that down to {rate(best)}%, a reduction of {best.reduction.toFixed(0)}%.
            {worst && worst.id !== best.id && <> The least effective was {worst.label} ({worst.reduction.toFixed(0)}% reduction).</>}
          </>
        ) : (
          ' None of the selected strategies reduced the outbreak.'
        )}
      </p>
      <p className="mt-2 text-[13px] leading-5 text-ink3">
        Every scenario ran on the same network with the same first cases, so differences come from the strategy alone. Averages over several runs are used because one random run can be lucky or unlucky.
      </p>
    </Panel>
  )
}

const shortLabel = (r: ScenarioResult) =>
  r.keys.length === 0
    ? 'No intervention'
    : r.keys
        .map((k) => ({ randomVax: 'Random vax', targetedVax: 'Targeted vax', distancing: 'Distancing', isolation: 'Isolation', tracing: 'Tracing' })[k])
        .join(' + ')

function ResultsTable({ results, runs, n }: { results: ScenarioResult[]; runs: number; n: number }) {
  const pm = (a: { mean: number; sd: number }, d = 0) => (
    <>
      {fmtNum(a.mean, d)}
      {runs > 1 && <span className="text-ink3"> ±{fmtNum(a.sd, d)}</span>}
    </>
  )
  return (
    <Panel title="Results" aside={<span>N = {n}</span>} pad={false}>
      <div className="overflow-x-auto px-5 pb-4">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="text-ink3">
            <tr className="border-b border-line">
              {[
                'Scenario',
                'Infected',
                'Peak',
                'Peak day',
                'Attack rate',
                'Recovered',
                'Uninfected',
                'Reduction',
              ].map((h, i) => (
                <th key={h} title={h === 'Reduction' ? 'Reduction in mean total infections versus the no-intervention baseline' : undefined} className={cx('px-2 py-2.5 font-normal', i > 0 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tnum font-mono">
            {results.map((r, i) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-2 py-2.5 font-sans text-ink">
                  <span className="mr-2 inline-block h-0.5 w-3 rounded align-middle" style={{ background: SERIES[i % SERIES.length] }} />
                  {r.label}
                  {r.keys.includes('randomVax') || r.keys.includes('targetedVax') ? (
                    <span className="ml-2 font-mono text-[12px] text-ink3">{fmtNum(r.stats.vaccinated.mean)} vaccinated</span>
                  ) : null}
                  {r.keys.includes('tracing') ? (
                    <span className="ml-2 font-mono text-[12px] text-ink3">{fmtNum(r.stats.quarantined.mean)} quarantined</span>
                  ) : null}
                </td>
                <td className="px-2 py-2.5 text-right text-ink">{pm(r.stats.cumulative)}</td>
                <td className="px-2 py-2.5 text-right text-ink2">{pm(r.stats.peak)}</td>
                <td className="px-2 py-2.5 text-right text-ink2">{pm(r.stats.peakDay, 1)}</td>
                <td className="px-2 py-2.5 text-right text-ink2">
                  {fmtPct(r.stats.attackRate.mean, 1)}
                </td>
                <td className="px-2 py-2.5 text-right text-ink2">{pm(r.stats.recovered)}</td>
                <td className="px-2 py-2.5 text-right text-ink2">{pm(r.stats.uninfected)}</td>
                <td className="px-2 py-2.5 text-right">
                  {r.id === 'none' ? (
                    <span className="text-ink3">baseline</span>
                  ) : (
                    <span className={r.reduction > 0 ? 'text-s' : 'text-ink2'}>{r.reduction.toFixed(1)}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[12px] leading-4 text-ink3">
          Reduction = (baseline infections − scenario infections) / baseline infections × 100, using mean cumulative infections; shown as 0 if the baseline has none.
        </p>
      </div>
    </Panel>
  )
}

/** Replays replicate 0 of every scenario on the same graph, one small network per scenario. */
function Replay({ results, positions }: { results: ScenarioResult[]; positions: Float32Array }) {
  const maxDay = Math.max(...results.map((r) => r.reference.frames.length - 1))
  const [chosenDay, setDay] = useState(8)
  // A new comparison can end sooner than the previous one, so the stored day is clamped on every render.
  const day = Math.min(chosenDay, maxDay)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setDay((d) => Math.min(d, maxDay) + 1), 350)
    return () => window.clearInterval(id)
  }, [playing, maxDay])
  // Stop at the last day. Kept out of the setDay updater, which must stay pure.
  useEffect(() => {
    if (playing && day >= maxDay) setPlaying(false)
  }, [playing, day, maxDay])

  return (
    <Panel
      title="Same day, every scenario"
      aside={<span className="tnum font-mono">day {day}</span>}
    >
      <div className="mb-4 flex items-center gap-3">
        <Btn
          size="sm"
          onClick={() => {
            if (day >= maxDay) setDay(0)
            setPlaying((p) => !p)
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </Btn>
        <input
          type="range"
          min={0}
          max={maxDay}
          value={day}
          aria-label="Day"
          style={{ ['--fill' as string]: `${maxDay ? (day / maxDay) * 100 : 0}%` }}
          onChange={(e) => {
            setPlaying(false)
            setDay(Number(e.target.value))
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {results.map((r) => {
          const d = Math.min(day, r.reference.frames.length - 1)
          const h = r.reference.history[d]
          const codes = r.reference.frames[d]
          const dist = r.config.interventions.distancing
          const showDist = dist.enabled && d >= dist.startDay ? r.reference.edgeDistanced : null
          return (
            <figure key={r.id} className="overflow-hidden rounded-xl border border-line">
              <NetworkCanvas className="aspect-square w-full" graph={r.graph} positions={positions} codes={codes} distanced={showDist} interactive={false} sizeByDegree ariaLabel={`${r.label} on day ${d}`} />
              <figcaption className="border-t border-line bg-card px-3 py-2">
                <div className="truncate text-[13px] text-ink">{shortLabel(r)}</div>
                <div className="tnum font-mono text-[12px] text-ink3">
                  I {h.I} · R {h.R} · S {h.S}
                </div>
              </figcaption>
            </figure>
          )
        })}
      </div>
      <p className="mt-3 text-[12px] leading-4 text-ink3">
        These are the seeded runs (replicate 0). Red dots are infected, blue recovered or vaccinated, green susceptible.
      </p>
    </Panel>
  )
}
