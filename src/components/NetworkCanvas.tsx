import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Graph } from '../engine'
import { CODE } from '../engine/types'
import { CODE_COLOR, COLORS } from '../theme'

/** Isolated and quarantined people make no contacts, so their edges are drawn as inactive. */
const offline = (code: number) => code === CODE.ISOLATED || code === CODE.QUARANTINED

export interface CanvasProps {
  graph: Graph
  /** Normalised layout positions [x0, y0, x1, y1, ...] in [-1, 1]. */
  positions: Float32Array
  /** Display code per vertex (see CODE), derived from the simulation. */
  codes: Uint8Array
  /** Edges removed by social distancing, drawn dashed. Null when distancing is not active. */
  distanced?: Uint8Array | null
  /** Overrides the state colour of a vertex (network explorer). */
  nodeColors?: string[]
  /** Edges that carried an actual transmission. */
  treeEdges?: ReadonlyArray<number>
  showTree?: boolean
  /** Edges / nodes to highlight (e.g. a shortest path). */
  highlightEdges?: ReadonlyArray<number>
  highlightNodes?: ReadonlyArray<number>
  highlightColor?: string
  /** Vertices to ring and edges to flash for the current day. */
  pulse?: { key: number; nodes: ReadonlyArray<number>; edges: ReadonlyArray<number> } | null
  selected?: number | null
  onSelect?: (id: number | null) => void
  renderTip?: (id: number) => ReactNode
  interactive?: boolean
  /** Scale nodes by degree. */
  sizeByDegree?: boolean
  /** Label the N highest-degree individuals so hubs are easy to spot. */
  labelHubs?: number
  className?: string
  ariaLabel?: string
}

interface View {
  zoom: number
  px: number
  py: number
}

const PULSE_MS = 650

export function NetworkCanvas(props: CanvasProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const view = useRef<View>({ zoom: 1, px: 0, py: 0 })
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const raf = useRef(0)
  const hubCache = useRef<{ graph: Graph | null; ids: number[] }>({ graph: null, ids: [] })
  const pulseStart = useRef({ key: -1, t: 0 })
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)

  const toScreen = useCallback((i: number) => {
    const { w, h } = size.current
    const v = view.current
    const base = (Math.min(w, h) / 2) * 0.9
    const p = propsRef.current.positions
    return { x: w / 2 + v.px + p[2 * i] * base * v.zoom, y: h / 2 + v.py + p[2 * i + 1] * base * v.zoom }
  }, [])

  const radiusOf = useCallback((i: number) => {
    const p = propsRef.current
    const z = Math.sqrt(view.current.zoom)
    const n = p.graph.n
    const baseR = n > 600 ? 2.4 : n > 300 ? 3 : 3.6
    const deg = p.sizeByDegree === false ? 0 : Math.sqrt(p.graph.degree[i])
    return (baseR + deg * (n > 600 ? 0.5 : 0.7)) * z
  }, [])

  const draw = useCallback(() => {
    const cv = canvas.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const p = propsRef.current
    const { w, h, dpr } = size.current
    if (!w || !h) return
    const dprGlow = 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const g = p.graph
    const sel = p.selected ?? -1
    const now = performance.now()
    if (pulseStart.current.key !== (p.pulse?.key ?? -1)) pulseStart.current = { key: p.pulse?.key ?? -1, t: now }
    const pulseT = p.pulse ? Math.min(1, (now - pulseStart.current.t) / PULSE_MS) : 1

    const pts: number[] = new Array(g.n * 2)
    for (let i = 0; i < g.n; i++) {
      const s = toScreen(i)
      pts[2 * i] = s.x
      pts[2 * i + 1] = s.y
    }

    // --- edges -------------------------------------------------------------------------------
    const segment = (e: number) => {
      const [u, v] = g.edges[e]
      ctx.moveTo(pts[2 * u], pts[2 * u + 1])
      ctx.lineTo(pts[2 * v], pts[2 * v + 1])
    }
    const dimmed = sel >= 0
    ctx.lineWidth = 1
    ctx.strokeStyle = dimmed ? 'rgba(236,236,238,0.05)' : 'rgba(236,236,238,0.11)'
    ctx.beginPath()
    for (let e = 0; e < g.edges.length; e++) {
      const [u, v] = g.edges[e]
      if (p.distanced?.[e]) continue
      if (offline(p.codes[u]) || offline(p.codes[v])) continue
      segment(e)
    }
    ctx.stroke()

    // Removed by social distancing: dashed and faint.
    if (p.distanced) {
      ctx.setLineDash([2, 4])
      ctx.strokeStyle = 'rgba(236,236,238,0.06)'
      ctx.beginPath()
      for (let e = 0; e < g.edges.length; e++) if (p.distanced[e]) segment(e)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // Inactive because an endpoint is isolated (orange) or in quarantine after tracing (teal).
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(245,158,66,0.28)'
    ctx.beginPath()
    for (let e = 0; e < g.edges.length; e++) {
      const [u, v] = g.edges[e]
      if (p.distanced?.[e]) continue
      if (p.codes[u] === CODE.ISOLATED || p.codes[v] === CODE.ISOLATED) segment(e)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(45,212,191,0.28)'
    ctx.beginPath()
    for (let e = 0; e < g.edges.length; e++) {
      const [u, v] = g.edges[e]
      if (p.distanced?.[e]) continue
      if (p.codes[u] === CODE.ISOLATED || p.codes[v] === CODE.ISOLATED) continue
      if (p.codes[u] === CODE.QUARANTINED || p.codes[v] === CODE.QUARANTINED) segment(e)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Edges that carried an actual transmission.
    if (p.showTree && p.treeEdges?.length) {
      ctx.strokeStyle = 'rgba(229,72,77,0.8)'
      ctx.lineWidth = 1.6
      ctx.shadowColor = 'rgba(229,72,77,0.9)'
      ctx.shadowBlur = 8
      ctx.beginPath()
      for (const e of p.treeEdges) segment(e)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    // Today's transmissions flash.
    if (p.pulse && pulseT < 1) {
      ctx.strokeStyle = `rgba(167,139,250,${0.9 * (1 - pulseT)})`
      ctx.lineWidth = 2.2
      ctx.shadowColor = 'rgba(167,139,250,0.95)'
      ctx.shadowBlur = 14
      ctx.beginPath()
      for (const e of p.pulse.edges) segment(e)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    if (p.highlightEdges?.length) {
      ctx.strokeStyle = p.highlightColor ?? COLORS.chalk
      ctx.lineWidth = 2.6
      ctx.beginPath()
      for (const e of p.highlightEdges) segment(e)
      ctx.stroke()
    }
    if (sel >= 0) {
      ctx.strokeStyle = 'rgba(239,234,224,0.8)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      for (const e of g.adjEdges[sel]) segment(e)
      ctx.stroke()
    }

    // --- nodes -------------------------------------------------------------------------------
    const neighbourOfSel = new Set<number>(sel >= 0 ? g.adjNodes[sel] : [])
    for (let i = 0; i < g.n; i++) {
      const code = p.codes[i]
      const x = pts[2 * i]
      const y = pts[2 * i + 1]
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue
      const r = radiusOf(i)
      const fill = p.nodeColors?.[i] ?? CODE_COLOR[code]
      ctx.globalAlpha = dimmed && i !== sel && !neighbourOfSel.has(i) ? 0.4 : 1
      ctx.fillStyle = fill
      // Colour-matched glow: strongest on active infections, softer elsewhere (skipped on very large graphs).
      const hot = code === CODE.I || code === CODE.NEW || code === CODE.ISOLATED
      if (g.n <= 500 || hot) {
        ctx.shadowColor = fill
        ctx.shadowBlur = (hot ? 16 : 7) * dprGlow
      }
      if (code === CODE.VACCINATED && !p.nodeColors) {
        // Vaccinated: rounded square with a pale ring, a different shape as well as a different colour.
        const s = r * 1.75
        ctx.beginPath()
        ctx.roundRect(x - s / 2, y - s / 2, s, s, Math.max(1.5, s * 0.22))
        ctx.fill()
        ctx.strokeStyle = 'rgba(239,234,224,0.85)'
        ctx.lineWidth = 1.2
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(11,12,15,0.85)'
        ctx.lineWidth = 1
        ctx.stroke()
        if (code === CODE.QUARANTINED && !p.nodeColors) {
          ctx.strokeStyle = 'rgba(45,212,191,0.95)'
          ctx.lineWidth = 1.2
          ctx.setLineDash([2, 2])
          ctx.beginPath()
          ctx.arc(x, y, r + 3, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (code === CODE.ISOLATED && !p.nodeColors) {
          ctx.strokeStyle = 'rgba(245,158,66,0.9)'
          ctx.lineWidth = 1.2
          ctx.setLineDash([2, 2])
          ctx.beginPath()
          ctx.arc(x, y, r + 3, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'
      ctx.globalAlpha = 1
    }

    // Labels on the highest-degree individuals.
    if (p.labelHubs && p.labelHubs > 0) {
      if (hubCache.current.graph !== g) {
        const ids = Array.from({ length: g.n }, (_, i) => i).sort((a, b) => g.degree[b] - g.degree[a] || a - b)
        hubCache.current = { graph: g, ids }
      }
      ctx.font = '500 11px "Geist Mono Variable", ui-monospace, monospace'
      ctx.textBaseline = 'middle'
      for (const i of hubCache.current.ids.slice(0, p.labelHubs)) {
        const x = pts[2 * i]
        const y = pts[2 * i + 1]
        if (x < 0 || y < 0 || x > w || y > h) continue
        const text = `#${i} · ${g.degree[i]} contacts`
        const tw = ctx.measureText(text).width
        const lx = x + radiusOf(i) + 6
        const ly = y - radiusOf(i) - 4
        ctx.fillStyle = 'rgba(11,12,15,0.82)'
        ctx.beginPath()
        ctx.roundRect(lx - 4, ly - 9, tw + 8, 18, 4)
        ctx.fill()
        ctx.fillStyle = COLORS.chalk
        ctx.fillText(text, lx, ly)
      }
    }

    // Expanding ring around each node infected today.
    if (p.pulse && pulseT < 1) {
      ctx.lineWidth = 1.6
      for (const i of p.pulse.nodes) {
        const x = pts[2 * i]
        const y = pts[2 * i + 1]
        ctx.strokeStyle = `rgba(167,139,250,${0.85 * (1 - pulseT)})`
        ctx.beginPath()
        ctx.arc(x, y, radiusOf(i) + 3 + 14 * pulseT, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    if (p.highlightNodes?.length) {
      ctx.strokeStyle = p.highlightColor ?? COLORS.chalk
      ctx.lineWidth = 2
      for (const i of p.highlightNodes) {
        ctx.beginPath()
        ctx.arc(pts[2 * i], pts[2 * i + 1], radiusOf(i) + 3, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    if (sel >= 0) {
      ctx.strokeStyle = COLORS.chalk
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pts[2 * sel], pts[2 * sel + 1], radiusOf(sel) + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (pulseT < 1) raf.current = requestAnimationFrame(draw)
  }, [radiusOf, toScreen])

  const requestDraw = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(draw)
  }, [draw])

  // Redraw whenever any input changes.
  useEffect(() => {
    requestDraw()
  })

  useEffect(() => {
    const el = wrap.current
    const cv = canvas.current
    if (!el || !cv) return
    const resize = () => {
      const r = el.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size.current = { w: r.width, h: r.height, dpr }
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      requestDraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf.current)
    }
  }, [requestDraw])

  const pick = useCallback(
    (cx: number, cy: number): number | null => {
      const g = propsRef.current.graph
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < g.n; i++) {
        const s = toScreen(i)
        const d = Math.hypot(s.x - cx, s.y - cy)
        const lim = radiusOf(i) + 5
        if (d < lim && d < bestD) {
          best = i
          bestD = d
        }
      }
      return best >= 0 ? best : null
    },
    [radiusOf, toScreen],
  )

  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const interactive = props.interactive !== false

  return (
    <div
      ref={wrap}
      className={`relative overflow-hidden ${props.className ?? ''}`}
      style={{ background: COLORS.canvas, touchAction: 'none' }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={props.ariaLabel ?? 'Contact network. Each dot is an individual coloured by infection state.'}
        className={interactive ? 'block size-full cursor-crosshair' : 'block size-full'}
        onPointerDown={(e) => {
          if (!interactive) return
          const { x, y } = local(e)
          drag.current = { x, y, px: view.current.px, py: view.current.py, moved: false }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!interactive) return
          const { x, y } = local(e)
          const d = drag.current
          if (d) {
            if (Math.hypot(x - d.x, y - d.y) > 4) d.moved = true
            if (d.moved) {
              view.current.px = d.px + (x - d.x)
              view.current.py = d.py + (y - d.y)
              setHover(null)
              requestDraw()
              return
            }
          }
          const id = pick(x, y)
          setHover((h) => (id === null ? (h ? null : h) : { id, x, y }))
        }}
        onPointerUp={(e) => {
          if (!interactive) return
          const { x, y } = local(e)
          const d = drag.current
          drag.current = null
          if (d && !d.moved) {
            const id = pick(x, y)
            propsRef.current.onSelect?.(id === propsRef.current.selected ? null : id)
          }
        }}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => {
          view.current = { zoom: 1, px: 0, py: 0 }
          requestDraw()
        }}
        onWheel={(e) => {
          if (!interactive) return
          const { x, y } = local(e)
          const v = view.current
          const nz = Math.max(1, Math.min(10, v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
          const k = nz / v.zoom
          const { w, h } = size.current
          // keep the point under the cursor fixed
          v.px = (x - w / 2) - (x - w / 2 - v.px) * k
          v.py = (y - h / 2) - (y - h / 2 - v.py) * k
          v.zoom = nz
          if (nz === 1) {
            v.px = 0
            v.py = 0
          }
          requestDraw()
        }}
      />
      {interactive && hover && props.renderTip && (
        <div
          className="pointer-events-none absolute z-10 max-w-60 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[13px] leading-5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          style={{
            left: Math.min(hover.x + 14, Math.max(0, size.current.w - 250)),
            top: Math.min(hover.y + 14, Math.max(0, size.current.h - 110)),
          }}
        >
          {props.renderTip(hover.id)}
        </div>
      )}
    </div>
  )
}
