import type { ReactNode } from 'react'
import { CODE } from '../engine/types'
import type { Metrics, NodeView } from '../engine'
import { COLORS } from '../theme'
import { fmtPct } from './ui'

function Glyph({ code }: { code: number }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const
  switch (code) {
    case CODE.VACCINATED:
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="9" height="9" rx="2" fill={COLORS.R} stroke={COLORS.chalk} strokeWidth="1.2" />
        </svg>
      )
    case CODE.ISOLATED:
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="3.2" fill={COLORS.ISO} />
          <circle cx="7" cy="7" r="5.6" fill="none" stroke={COLORS.ISO} strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      )
    default: {
      const color = { [CODE.S]: COLORS.S, [CODE.I]: COLORS.I, [CODE.R]: COLORS.R, [CODE.NEW]: COLORS.NEW }[code] ?? COLORS.ink2
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.5" fill={color} />
        </svg>
      )
    }
  }
}

const LEGEND: Array<[number, string]> = [
  [CODE.S, 'Susceptible'],
  [CODE.I, 'Infected'],
  [CODE.NEW, 'Newly infected'],
  [CODE.R, 'Recovered'],
  [CODE.VACCINATED, 'Vaccinated'],
  [CODE.ISOLATED, 'Isolated'],
]

export function Legend({ className }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink2 ${className ?? ''}`} aria-label="Legend">
      {LEGEND.map(([code, label]) => (
        <li key={code} className="flex items-center gap-1.5">
          <Glyph code={code} />
          {label}
        </li>
      ))}
    </ul>
  )
}

/** S + I + R = N, calculated from the live simulation state. */
export function InvariantLedger({ m, violations }: { m: Metrics; violations: string[] }) {
  const sum = m.susceptible + m.infected + m.removed
  const ok = sum === m.population && violations.length === 0
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-card px-4 py-2.5 font-mono text-[13px] text-ink2"
      title={ok ? 'Every invariant of the SIR model currently holds' : violations.slice(0, 5).join('\n')}
    >
      <span className="tnum" style={{ color: COLORS.S }}>
        S {m.susceptible}
      </span>
      <span className="text-ink3">+</span>
      <span className="tnum" style={{ color: COLORS.I }}>
        I {m.infected}
      </span>
      <span className="text-ink3">+</span>
      <span className="tnum" style={{ color: COLORS.R }}>
        R {m.removed}
      </span>
      <span className="text-ink3">=</span>
      <span className="tnum text-ink">{sum}</span>
      <span className="text-ink3">=</span>
      <span className="tnum text-ink">N {m.population}</span>
      <span className="ml-auto flex items-center gap-1.5 text-[12px]" style={{ color: ok ? COLORS.S : COLORS.I }}>
        <span className="size-1.5 rounded-full" style={{ background: ok ? COLORS.S : COLORS.I }} />
        {ok ? 'invariants hold' : `${violations.length} violation${violations.length === 1 ? '' : 's'}`}
      </span>
    </div>
  )
}

/** Share of the population in each state, as one stacked bar plus a legend row. */
export function DistributionBar({ m }: { m: Metrics }) {
  const n = m.population
  const parts = [
    { label: 'Susceptible', v: m.susceptible, color: COLORS.S },
    { label: 'Infected', v: m.infected, color: COLORS.I },
    { label: 'Recovered', v: m.recovered, color: COLORS.R },
    { label: 'Vaccinated', v: m.vaccinated, color: '#3b6db8' },
  ]
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-md bg-raised" role="img" aria-label="Population share by state">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.v / n) * 100}%`, background: p.color }} className="transition-[width] duration-300 ease-out-soft" />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2 text-[13px]">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <dt className="text-ink2">{p.label}</dt>
            <dd className="tnum ml-auto font-mono text-ink">{fmtPct(p.v / n, 1)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function NodeInspector({ node, onClose, extra }: { node: NodeView; onClose?: () => void; extra?: ReactNode }) {
  const status = node.vaccinated ? 'Vaccinated (immune)' : node.status === 'S' ? 'Susceptible' : node.status === 'I' ? (node.isolated ? 'Infected, isolated' : 'Infected') : 'Recovered'
  const rows: Array<[string, ReactNode]> = [
    ['State', status],
    ['Degree', node.degree],
    ['Degree centrality', node.centrality.toFixed(3)],
    ['Infected on day', node.infectionDay ?? '—'],
    ['Recovered on day', node.recoveryDay ?? '—'],
    ['Infected by', node.source === null ? (node.infectionDay === 0 ? 'initial case' : '—') : `individual ${node.source}`],
    ['Secondary infections', node.secondaryInfections],
  ]
  if (node.isolationDay !== null) rows.push(['Isolated on day', node.isolationDay])
  return (
    <div className="w-64 rounded-xl border border-line-strong bg-raised/95 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-ink">Individual {node.id}</h3>
        {onClose && (
          <button onClick={onClose} className="rounded-md px-1.5 text-[13px] text-ink3 transition-colors duration-150 hover:text-ink" aria-label="Close inspector">
            Close
          </button>
        )}
      </div>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-[13px]">
            <dt className="text-ink3">{k}</dt>
            <dd className="tnum text-right font-mono text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {extra}
    </div>
  )
}

export function nodeTip(node: NodeView) {
  const status = node.vaccinated ? 'Vaccinated' : node.status === 'S' ? 'Susceptible' : node.status === 'I' ? (node.isolated ? 'Isolated' : 'Infected') : 'Recovered'
  return (
    <div>
      <div className="font-medium text-ink">Individual {node.id}</div>
      <div className="tnum font-mono text-[12px] text-ink2">
        degree {node.degree} · {status}
        {node.infectionDay !== null && ` · day ${node.infectionDay}`}
      </div>
    </div>
  )
}
