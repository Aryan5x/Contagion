import { Suspense, lazy, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, FlaskConical, GitCompareArrows, House, Info, Menu, Network, ShieldPlus, Sigma, X } from 'lucide-react'
import { WorkspaceProvider, useWorkspace } from './state/workspace'
import { NETWORK_SHORT } from './engine'
import { cx } from './components/ui'
import { Overview } from './pages/Overview'

// Every page except the landing page is its own chunk, fetched when first opened, so the first
// screen does not wait for the chart library and the other pages. Each loader is kept so the
// chunks can also be fetched ahead of time (see prefetchPages).
const loaders = {
  live: () => import('./pages/LiveSimulation').then((m) => ({ default: m.LiveSimulation })),
  network: () => import('./pages/NetworkExplorer').then((m) => ({ default: m.NetworkExplorer })),
  interventions: () => import('./pages/Interventions').then((m) => ({ default: m.Interventions })),
  comparison: () => import('./pages/Comparison').then((m) => ({ default: m.Comparison })),
  lab: () => import('./pages/ExperimentLab').then((m) => ({ default: m.ExperimentLab })),
  concepts: () => import('./pages/Concepts').then((m) => ({ default: m.Concepts })),
  about: () => import('./pages/About').then((m) => ({ default: m.About })),
}
const LiveSimulation = lazy(loaders.live)
const NetworkExplorer = lazy(loaders.network)
const Interventions = lazy(loaders.interventions)
const Comparison = lazy(loaders.comparison)
const ExperimentLab = lazy(loaders.lab)
const Concepts = lazy(loaders.concepts)
const About = lazy(loaders.about)

/** Fetches every page chunk once the browser is idle, so moving between pages stays instant. */
function prefetchPages() {
  const run = () => Object.values(loaders).forEach((load) => void load().catch(() => {}))
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[13px] text-ink3" role="status">
      Loading…
    </div>
  )
}

export type RouteId = 'overview' | 'live' | 'network' | 'interventions' | 'comparison' | 'lab' | 'concepts' | 'about'

const NAV: Array<{ id: RouteId; label: string; icon: typeof House; group: 'run' | 'learn' }> = [
  { id: 'overview', label: 'Overview', icon: House, group: 'run' },
  { id: 'live', label: 'Live simulation', icon: Activity, group: 'run' },
  { id: 'network', label: 'Network explorer', icon: Network, group: 'run' },
  { id: 'interventions', label: 'Interventions', icon: ShieldPlus, group: 'run' },
  { id: 'comparison', label: 'Scenario comparison', icon: GitCompareArrows, group: 'run' },
  { id: 'lab', label: 'Experiment lab', icon: FlaskConical, group: 'learn' },
  { id: 'concepts', label: 'Mathematical concepts', icon: Sigma, group: 'learn' },
  { id: 'about', label: 'About the project', icon: Info, group: 'learn' },
]

const isRoute = (s: string): s is RouteId => NAV.some((n) => n.id === s)

function useRoute(): [RouteId, (r: RouteId) => void] {
  const read = (): RouteId => {
    const h = window.location.hash.replace(/^#\/?/, '')
    return isRoute(h) ? h : 'overview'
  }
  const [route, setRoute] = useState<RouteId>(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [
    route,
    (r) => {
      window.location.hash = `/${r}`
    },
  ]
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
      <g stroke="#ececee" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M7 21 L16 9 L25 21" />
      </g>
      <circle cx="7" cy="21" r="3.6" fill="#4cc38a" />
      <circle cx="16" cy="9" r="3.6" fill="#e5484d" />
      <circle cx="25" cy="21" r="3.6" fill="#5b9cf6" />
    </svg>
  )
}

function Sidebar({ route, go, onNavigate }: { route: RouteId; go: (r: RouteId) => void; onNavigate?: () => void }) {
  const w = useWorkspace()
  const item = (n: (typeof NAV)[number]) => {
    const Icon = n.icon
    const active = n.id === route
    return (
      <li key={n.id}>
        <a
          href={`#/${n.id}`}
          onClick={(e) => {
            e.preventDefault()
            go(n.id)
            onNavigate?.()
          }}
          aria-current={active ? 'page' : undefined}
          className={cx(
            'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors duration-150',
            active ? 'bg-raised text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'text-ink2 hover:bg-raised/60 hover:text-ink',
          )}
        >
          <Icon size={16} strokeWidth={1.5} className={cx('shrink-0', active ? 'text-ink' : 'text-ink3')} />
          {n.label}
          {n.id === 'live' && w.running && <span className="ml-auto size-1.5 rounded-full bg-s" aria-label="running" />}
        </a>
      </li>
    )
  }
  return (
    <div className="flex h-full flex-col bg-side">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Mark />
        <span className="text-[16px] font-medium tracking-[-0.01em]">Breaking the Chain</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pt-2" aria-label="Primary">
        <ul className="space-y-0.5">{NAV.filter((n) => n.group === 'run').map(item)}</ul>
        <div className="mt-6 mb-2 px-2.5 text-[13px] text-ink3">Learn and test</div>
        <ul className="space-y-0.5">{NAV.filter((n) => n.group === 'learn').map(item)}</ul>
      </nav>
      <div className="m-3 rounded-xl border border-line bg-card p-3 font-mono text-[12px] leading-5 text-ink3">
        <div className="text-ink2">
          {NETWORK_SHORT[w.config.network.type]} · n {w.config.network.n}
        </div>
        <div>
          day {w.metrics.day} · seed {w.config.network.seed}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={cx('size-1.5 rounded-full', w.running ? 'bg-s' : 'bg-ink3')} />
          {w.running ? 'running' : w.metrics.finished ? 'epidemic over' : 'paused'}
        </div>
      </div>
    </div>
  )
}

function Shell() {
  const [route, go] = useRoute()
  const [open, setOpen] = useState(false)
  useEffect(prefetchPages, [])
  useEffect(() => {
    window.scrollTo({ top: 0 })
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [route])

  let page: ReactNode
  switch (route) {
    case 'overview':
      page = <Overview go={go} />
      break
    case 'live':
      page = <LiveSimulation go={go} />
      break
    case 'network':
      page = <NetworkExplorer />
      break
    case 'interventions':
      page = <Interventions go={go} />
      break
    case 'comparison':
      page = <Comparison />
      break
    case 'lab':
      page = <ExperimentLab />
      break
    case 'concepts':
      page = <Concepts />
      break
    case 'about':
      page = <About />
      break
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line lg:block">
        <Sidebar route={route} go={go} />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line">
            <Sidebar route={route} go={go} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-line bg-side px-4 lg:hidden">
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} className="rounded-lg p-1.5 text-ink2 hover:bg-raised">
            {open ? <X size={18} strokeWidth={1.5} /> : <Menu size={18} strokeWidth={1.5} />}
          </button>
          <Mark />
          <span className="font-medium">Breaking the Chain</span>
        </div>
        <main id="main" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div key={route} className="mx-auto w-full max-w-[1520px] px-4 py-8 sm:px-6 lg:px-8">
            <Suspense fallback={<PageLoading />}>{page}</Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

export function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  )
}
