import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Curve, StepRecord, VariantResult } from '../engine'
import { COLORS, SERIES } from '../theme'

const axis = { fill: COLORS.ink3, fontSize: 12, fontFamily: 'Geist Mono Variable, ui-monospace, monospace' }
const tickLine = { stroke: COLORS.grid }

interface TipItem {
  name?: string | number
  value?: number | string | Array<number | string>
  color?: string
  dataKey?: string | number
}
interface TipProps {
  active?: boolean
  payload?: TipItem[]
  label?: string | number
}

function Tip({ active, payload, label, labelPrefix = 'Day', hide }: TipProps & { labelPrefix?: string; hide?: string[] }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => !hide?.includes(String(p.dataKey)) && !Array.isArray(p.value))
  return (
    <div className="rounded-lg border border-line-strong bg-raised px-3 py-2 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="mb-1 font-mono text-ink3">
        {labelPrefix} {label}
      </div>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 leading-5">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink2">{p.name}</span>
          <span className="tnum ml-auto pl-4 font-mono text-ink">{typeof p.value === 'number' ? Math.round(p.value * 100) / 100 : p.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Susceptible, infected and recovered counts over time, straight from the simulation history.
 * With a baseline (the same epidemic without interventions) a dashed line shows what would have happened.
 */
export function SirChart({
  history,
  population,
  height = 320,
  baseline,
}: {
  history: readonly StepRecord[]
  population: number
  height?: number
  baseline?: readonly StepRecord[] | null
}) {
  const len = Math.min(160, Math.max(history.length, baseline?.length ?? 0))
  const data = Array.from({ length: len }, (_, d) => {
    const h = history[d]
    return {
      day: d,
      S: h?.S,
      I: h?.I,
      R: h?.R,
      base: baseline ? (baseline[Math.min(d, baseline.length - 1)]?.I ?? 0) : undefined,
    }
  })
  const step = [10, 20, 25, 50, 100, 200, 250].find((s) => population / s <= 5) ?? 500
  const ticks = Array.from({ length: Math.ceil(population / step) + 1 }, (_, i) => i * step)
  const today = history[history.length - 1]?.day ?? 0
  return (
    <div style={{ height }} role="img" aria-label="Line chart of susceptible, infected and recovered counts per day">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="day" tick={axis} tickLine={tickLine} axisLine={tickLine} minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, ticks[ticks.length - 1]]} ticks={ticks} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={{ stroke: COLORS.ink3, strokeDasharray: '3 3' }} />
          {baseline && today > 0 && <ReferenceLine x={today} stroke={COLORS.ink3} strokeDasharray="2 4" />}
          {baseline && (
            <Line name="Infected without intervention" dataKey="base" stroke={COLORS.ink2} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          )}
          <Line name="Susceptible" dataKey="S" stroke={COLORS.S} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line name="Infected" dataKey="I" stroke={COLORS.I} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line name="Recovered / immune" dataKey="R" stroke={COLORS.R} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function NewInfectionsChart({ history, height = 200 }: { history: readonly StepRecord[]; height?: number }) {
  const data = history.map((h) => ({ day: h.day, new: h.newInfections }))
  return (
    <div style={{ height }} role="img" aria-label="Bar chart of new infections per day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap={1}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="day" tick={axis} tickLine={tickLine} axisLine={tickLine} minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(236,236,238,0.05)' }} />
          <Bar name="New infections" dataKey="new" fill={COLORS.NEW} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DegreeChart({ data, logScale, height = 240 }: { data: Array<{ degree: number; count: number }>; logScale?: boolean; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Degree distribution: number of individuals with each degree">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 16, left: -12 }} barCategoryGap={2}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="degree" tick={axis} tickLine={tickLine} axisLine={tickLine} minTickGap={12} label={{ value: 'degree k', position: 'insideBottom', offset: -10, fill: COLORS.ink3, fontSize: 12 }} />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            scale={logScale ? 'log' : 'linear'}
            domain={logScale ? [1, 'auto'] : [0, 'auto']}
            allowDecimals={false}
          />
          <Tooltip content={<Tip labelPrefix="Degree" />} cursor={{ fill: 'rgba(236,236,238,0.05)' }} />
          <Bar name="Individuals" dataKey="count" fill={COLORS.chalk} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function padCurve(c: Curve[], len: number): Curve[] {
  if (c.length >= len) return c.slice(0, len)
  const last = c[c.length - 1]
  return [...c, ...Array.from({ length: len - c.length }, (_, i) => ({ day: c.length + i, mean: last.mean, sd: 0 }))]
}

/** Mean infected over time for several variants, with a faint band of one standard deviation. */
export function CurvesChart({
  variants,
  field = 'I',
  height = 320,
  bands = true,
  maxDay,
}: {
  variants: Array<Pick<VariantResult, 'id' | 'label' | 'curves'>>
  field?: 'I' | 'newInfections'
  height?: number
  bands?: boolean
  maxDay?: number
}) {
  const len = Math.min(maxDay ?? 400, Math.max(...variants.map((v) => v.curves[field].length)))
  const padded = variants.map((v) => padCurve(v.curves[field], len))
  const data = Array.from({ length: len }, (_, d) => {
    const row: Record<string, number | number[]> = { day: d }
    padded.forEach((c, i) => {
      row[`m${i}`] = c[d].mean
      row[`b${i}`] = [Math.max(0, c[d].mean - c[d].sd), c[d].mean + c[d].sd]
    })
    return row
  })
  return (
    <div style={{ height }} role="img" aria-label="Mean number of infected individuals per day for each scenario">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="day" tick={axis} tickLine={tickLine} axisLine={tickLine} minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<Tip hide={variants.map((_, i) => `b${i}`)} />} cursor={{ stroke: COLORS.ink3, strokeDasharray: '3 3' }} />
          {bands &&
            variants.map((v, i) => (
              <Area key={`b${i}`} dataKey={`b${i}`} name={`${v.label} ±1 sd`} stroke="none" fill={SERIES[i % SERIES.length]} fillOpacity={0.09} isAnimationActive={false} legendType="none" />
            ))}
          {variants.map((v, i) => (
            <Line key={`m${i}`} dataKey={`m${i}`} name={v.label} stroke={SERIES[i % SERIES.length]} strokeWidth={i === 0 ? 2.4 : 2} dot={false} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SeriesLegend({ items }: { items: Array<{ label: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink2">
      {items.map((it, i) => (
        <li key={it.label} className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded" style={{ background: SERIES[i % SERIES.length] }} />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

/** Mean attack rate with one-sd whiskers per variant (a comparison of magnitudes: bars). */
export function AttackBars({ items, height = 240, valueKey = 'attack' }: { items: Array<{ label: string; mean: number; sd: number }>; height?: number; valueKey?: string }) {
  const data = items.map((i) => ({ label: i.label, [valueKey]: Math.round(i.mean * 1000) / 10, err: Math.round(i.sd * 1000) / 10 }))
  return (
    <div style={{ height }} role="img" aria-label="Mean attack rate per scenario with standard deviation">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={items.length > 3 ? { ...axis, angle: -28, textAnchor: 'end' } : axis}
            height={items.length > 3 ? 78 : 30}
            tickLine={tickLine}
            axisLine={tickLine}
            interval={0}
          />
          <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
          <Tooltip content={<Tip labelPrefix="" />} cursor={{ fill: 'rgba(236,236,238,0.05)' }} />
          <Bar name="Attack rate (%)" dataKey={valueKey} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={i === 0 && d.label.toLowerCase().includes('no ') ? COLORS.ink3 : COLORS.chalk} />
            ))}
            <ErrorBar dataKey="err" width={5} stroke={COLORS.ink2} strokeWidth={1.2} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Attack rate against a numeric variable (experiment 4), with a +-1 sd band. */
export function XYBand({
  points,
  xLabel,
  height = 280,
  threshold,
}: {
  points: Array<{ x: number; mean: number; sd: number }>
  xLabel: string
  height?: number
  threshold?: number
}) {
  const data = points.map((p) => ({
    x: p.x,
    mean: Math.round(p.mean * 1000) / 10,
    band: [Math.max(0, (p.mean - p.sd) * 100), Math.min(100, (p.mean + p.sd) * 100)],
  }))
  return (
    <div style={{ height }} role="img" aria-label={`Mean attack rate against ${xLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 18, left: -8 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={axis} tickLine={tickLine} axisLine={tickLine} label={{ value: xLabel, position: 'insideBottom', offset: -10, fill: COLORS.ink3, fontSize: 12 }} />
          <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
          <Tooltip content={<Tip labelPrefix={xLabel.split(' ')[0]} hide={['band']} />} cursor={{ stroke: COLORS.ink3, strokeDasharray: '3 3' }} />
          {threshold !== undefined && <ReferenceLine x={threshold} stroke={COLORS.ink3} strokeDasharray="4 4" label={{ value: 'R₀ = 1', fill: COLORS.ink3, fontSize: 12, position: 'insideTopRight' }} />}
          <Area dataKey="band" name="±1 sd" stroke="none" fill={COLORS.chalk} fillOpacity={0.1} isAnimationActive={false} />
          <Line dataKey="mean" name="Mean attack rate (%)" stroke={COLORS.chalk} strokeWidth={2.4} dot={{ r: 3, fill: COLORS.chalk, stroke: COLORS.chalk }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
