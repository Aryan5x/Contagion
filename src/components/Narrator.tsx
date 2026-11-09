import type { ReactNode } from 'react'
import { cutContacts, explainDay, longestChain } from '../engine'
import type { Metrics, Phase, Simulation } from '../engine'
import { COLORS } from '../theme'
import { Btn, fmtNum, fmtPct } from './ui'

const PHASE: Record<Phase, { label: string; color: string }> = {
  start: { label: 'Starting point', color: COLORS.ink3 },
  growing: { label: 'The chain is growing', color: COLORS.I },
  peak: { label: 'At the peak', color: COLORS.ISO },
  declining: { label: 'The chain is fading', color: COLORS.R },
  over: { label: 'The chain is broken', color: COLORS.S },
}

function Id({ id, onSelect }: { id: number; onSelect?: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(id)}
      className="tnum rounded px-1 font-mono text-[13px] text-ink underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:bg-raised"
      title="Select this individual on the network"
    >
      #{id}
    </button>
  )
}

const plural = (n: number, one: string, many = one + 's') => `${fmtNum(n)} ${n === 1 ? one : many}`

/** Plain-language commentary on the current day, written from the simulation's own state and log. */
export function StoryPanel({
  sim,
  metrics: m,
  baseline,
  onSelect,
  showTree,
  onToggleTree,
}: {
  sim: Simulation
  metrics: Metrics
  baseline: Simulation | null
  onSelect: (id: number) => void
  showTree: boolean
  onToggleTree: (v: boolean) => void
}) {
  const r = explainDay(sim)
  const cfg = sim.config
  const n = sim.graph.n
  const avg = (2 * sim.graph.edges.length) / n
  const cut = cutContacts(sim)
  const chain = longestChain(sim)
  const phase = PHASE[r.phase]
  const iv = cfg.interventions

  let headline: string
  const points: ReactNode[] = []

  if (r.phase === 'start') {
    headline = `${plural(r.initialCases.length, 'person starts', 'people start')} infected; everyone else is still susceptible`
    points.push(
      <>
        The red dots are the initial cases: {r.initialCases.map((c, i) => (
          <span key={c.id}>{i > 0 && ', '}<Id id={c.id} onSelect={onSelect} /> ({c.degree} contacts)</span>
        ))}. Each line leaving a red dot is a contact through which the infection could pass.
      </>,
    )
    points.push(
      <>
        Press <strong className="font-medium text-ink">Start</strong> or <strong className="font-medium text-ink">Step</strong>. Each day, every infected person tries each of their contacts with a susceptible neighbour, and each try succeeds with probability β = {cfg.beta.toFixed(3)}.
      </>,
    )
    if (m.vaccinated > 0)
      points.push(
        <>
          {plural(m.vaccinated, 'person is', 'people are')} already vaccinated (squares). They are immune, so the chain cannot pass through them: {fmtNum(cut.cut)} of {fmtNum(cut.total)} contacts ({fmtPct(cut.cut / Math.max(1, cut.total))}) are already cut.
        </>,
      )
  } else {
    if (r.phase === 'growing') headline = `The chain is growing: ${plural(r.newInfections.length, 'new infection')} on day ${r.day}`
    else if (r.phase === 'peak') headline = `At the peak: ${plural(r.infectedNow, 'person is', 'people are')} infectious`
    else if (r.phase === 'declining') headline = `The chain is fading: recoveries now outnumber new infections`
    else headline = `The chain is broken: nobody is infectious any more`

    if (r.newInfections.length > 0)
      points.push(
        <>
          {plural(r.newInfections.length, 'person')} caught it today. Each was susceptible and had an infected contact that passed it on (purple lines). New cases start infecting others tomorrow, not today.
        </>,
      )
    else if (r.phase !== 'over')
      points.push(<>Nobody new caught it today: the infected people had no remaining susceptible contacts that the infection reached.</>)

    if (r.topSpreader && r.topSpreader.count >= 2 && r.topSpreader.degree > avg)
      points.push(
        <>
          <Id id={r.topSpreader.id} onSelect={onSelect} /> infected {r.topSpreader.count} people today. They have {r.topSpreader.degree} contacts, {(r.topSpreader.degree / avg).toFixed(1)}× the average of {avg.toFixed(1)}: well-connected people create many links in the chain.
        </>,
      )

    if (r.phase === 'declining' && r.infectedBefore !== null)
      points.push(
        <>
          Infected people fell from {r.infectedBefore} to {r.infectedNow}: {plural(r.recoveries.length, 'recovery', 'recoveries')} against {plural(r.newInfections.length, 'new infection')}. The peak was {r.peakInfected} infected on day {r.peakDay}.
        </>,
      )
    else if (r.recoveries.length > 0)
      points.push(
        <>
          {plural(r.recoveries.length, 'person')} recovered. Recovered people are immune: they cannot catch it again or pass it on, so each recovery removes a link from the chain.
        </>,
      )

    if (r.isolatedToday.length > 0)
      points.push(
        <>
          {plural(r.isolatedToday.length, 'person was', 'people were')} detected and isolated. Their contacts (dashed orange) are switched off for {iv.isolation.duration} days, so the chain cannot pass through them.
          {iv.tracing.enabled && ` Contact tracing then searches their contacts up to ${plural(iv.tracing.depth, 'step')} away.`}
        </>,
      )
    if (r.quarantinedToday.length > 0)
      points.push(
        <>
          {plural(r.quarantinedToday.length, 'traced contact starts', 'traced contacts start')} quarantine today for {iv.tracing.duration} days (dashed teal ring). People in quarantine can neither catch the infection nor pass it on, even before anyone knows they were exposed.
        </>,
      )
    if (iv.distancing.enabled && sim.distancingActive)
      points.push(
        <>
          Social distancing is on: {iv.distancing.pct}% of contacts are switched off (faint dashed lines), so there are fewer routes for the infection.
        </>,
      )
  }

  // verdict once the epidemic has ended
  let verdict: ReactNode = null
  if (r.phase === 'over') {
    let escaped = 0
    for (let v = 0; v < n; v++) if (sim.status[v] === 0) escaped++
    verdict = (
      <div className="mt-4 rounded-xl border border-line-strong bg-bg px-4 py-3 text-[14px] leading-6 text-ink2">
        <p>
          <span className="text-ink">{fmtNum(m.cumulativeInfections)} of {fmtNum(n)} people ({fmtPct(m.attackRate, 1)}) were infected</span> over {m.day} days. {escaped > 0 && <>Another {fmtNum(escaped)} were never reached because no chain of contacts led to them{m.vaccinated > 0 && <>, and {fmtNum(m.vaccinated)} were vaccinated</>}.</>}
        </p>
        {baseline && (
          <p className="mt-2">
            Without any intervention the same epidemic would have infected{' '}
            <span className="text-ink">{fmtNum(baseline.counts.cumulative)} ({fmtPct(baseline.counts.cumulative / n, 1)})</span>.{' '}
            {baseline.counts.cumulative > m.cumulativeInfections ? (
              <span className="text-s">The interventions prevented {fmtNum(baseline.counts.cumulative - m.cumulativeInfections)} infections.</span>
            ) : (
              <span>These interventions did not reduce the outbreak in this run.</span>
            )}
          </p>
        )}
      </div>
    )
  }

  const example = r.example
  const links = chain.length - 1

  return (
    <div>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="size-2 rounded-full" style={{ background: phase.color }} />
        <span className="text-ink2">{phase.label}</span>
        <span className="tnum ml-auto font-mono text-ink3">day {r.day}</span>
      </div>
      <h3 className="mt-2 font-serif text-[21px] leading-[28px] tracking-[-0.01em] text-ink">{headline}</h3>
      <ul className="mt-3 space-y-2.5 text-[14px] leading-[22px] text-ink2">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink3" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {verdict}

      <div className="mt-4 rounded-xl border border-line bg-bg px-4 py-3">
        <div className="text-[13px] text-ink3">The maths behind it</div>
        <p className="mt-1.5 font-mono text-[12px] leading-5 text-chalk">
          P(infected) = 1 − (1 − β)<sup>k</sup>
          <br />
          P(recover) = γ = {cfg.gamma.toFixed(2)} <span className="text-ink3">(about {(1 / cfg.gamma).toFixed(1)} days infectious)</span>
        </p>
        <p className="mt-2 text-[13px] leading-5 text-ink2">
          k is how many of a susceptible person's contacts are infected. More contacts means more chances: that is why the degree of a vertex matters.
        </p>
        {example && (
          <p className="mt-2 text-[13px] leading-5 text-ink2">
            <span className="text-ink">Today's example:</span> <Id id={example.target} onSelect={onSelect} /> had k = {example.k} infected contact{example.k > 1 ? 's' : ''}, so its chance was 1 − (1 − {cfg.beta.toFixed(3)})<sup>{example.k}</sup> = <span className="tnum font-mono text-ink">{(example.p * 100).toFixed(1)}%</span>. It was infected.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div className="rounded-xl border border-line px-3 py-2.5">
          <div className="text-ink3">Longest chain so far</div>
          <div className="tnum mt-0.5 font-mono text-[18px] text-ink">{links} {links === 1 ? 'link' : 'links'}</div>
          <div className="tnum mt-0.5 truncate font-mono text-[12px] text-ink3" title={chain.join(' → ')}>
            {links === 0 ? 'initial case only' : chain.length > 5 ? `${chain[0]} → … → ${chain.slice(-2).join(' → ')}` : chain.join(' → ')}
          </div>
        </div>
        <div className="rounded-xl border border-line px-3 py-2.5">
          <div className="text-ink3">Contacts cut</div>
          <div className="tnum mt-0.5 font-mono text-[18px] text-ink">{fmtPct(cut.cut / Math.max(1, cut.total))}</div>
          <div className="tnum mt-0.5 font-mono text-[12px] text-ink3">{fmtNum(cut.cut)} of {fmtNum(cut.total)} contacts</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[13px] text-ink3">
        <span>Show which contacts actually carried the infection</span>
        <Btn size="sm" variant={showTree ? 'secondary' : 'ghost'} aria-pressed={showTree} onClick={() => onToggleTree(!showTree)}>
          {showTree ? 'Chain shown' : 'Show chain'}
        </Btn>
      </div>
    </div>
  )
}

/** One line per day, newest first. */
export function Timeline({ sim }: { sim: Simulation }) {
  const rows = sim.history.map((h, i) => {
    const prev = i > 0 ? sim.history[i - 1] : null
    const recovered = prev ? prev.I + h.newInfections - h.I : 0
    return { ...h, recovered }
  })
  return (
    <ol className="max-h-56 space-y-1 overflow-y-auto pr-1 font-mono text-[12px]">
      {[...rows].reverse().map((h) => (
        <li key={h.day} className="tnum flex gap-3 text-ink2">
          <span className="w-12 shrink-0 text-ink3">day {h.day}</span>
          <span className="w-16 shrink-0" style={{ color: h.newInfections ? COLORS.NEW : undefined }}>+{h.newInfections} new</span>
          <span className="w-20 shrink-0" style={{ color: h.recovered ? COLORS.R : undefined }}>{h.recovered} recovered</span>
          <span className="text-ink">{h.I} infectious</span>
        </li>
      ))}
    </ol>
  )
}

/** Three-step reading guide for the live page. */
export function GuideStrip({ onHide, onGoInterventions }: { onHide: () => void; onGoInterventions: () => void }) {
  const steps = [
    {
      n: '1',
      title: 'The network is the population',
      body: 'Each dot is a person (a vertex). Each line is a contact (an edge) through which the infection could pass. Bigger dots have more contacts.',
    },
    {
      n: '2',
      title: 'The infection follows one rule',
      body: 'Each day an infected person (red) can pass it to every susceptible neighbour (green). When they recover (blue) they are immune and can no longer pass it on.',
    },
    {
      n: '3',
      title: 'Your goal: break the chain',
      body: 'Cut the links the infection travels along. Vaccinate (squares), cut contacts (dashed lines) or isolate (orange) until infected people have nobody left to infect.',
    },
  ]
  return (
    <section aria-label="How to read this screen" className="rise-2 mb-5 rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="text-[15px] font-medium">How to read this screen</h2>
        <div className="flex items-center gap-1">
          <Btn size="sm" variant="ghost" onClick={onGoInterventions}>
            Try an intervention
          </Btn>
          <Btn size="sm" variant="ghost" onClick={onHide}>
            Hide guide
          </Btn>
        </div>
      </div>
      <ol className="grid gap-px p-5 pt-3 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 py-2 md:px-5 md:first:pl-0 md:last:pr-0">
            <span className="tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[12px] text-ink2">{s.n}</span>
            <div>
              <h3 className="text-[14px] font-medium text-ink">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-5 text-ink2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
