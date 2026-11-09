import { useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/** Hover / focus tooltip for technical terms. Shifts sideways so it never leaves the viewport. */
export function Info({ children, label }: { children: ReactNode; label?: string }) {
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  const place = () => {
    const el = wrap.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(256, window.innerWidth - 16)
    const center = r.left + r.width / 2
    const left = Math.max(8, Math.min(center - width / 2, window.innerWidth - 8 - width))
    setShift(left - r.left)
  }
  return (
    <span ref={wrap} className="group relative inline-flex align-middle" onMouseEnter={place} onFocus={place}>
      <button
        type="button"
        aria-describedby={id}
        aria-label={label ?? 'More information'}
        className="inline-flex size-4 items-center justify-center rounded-full text-ink3 transition-colors duration-150 hover:text-ink focus-visible:text-ink"
      >
        <CircleHelp size={14} strokeWidth={1.5} />
      </button>
      <span
        id={id}
        role="tooltip"
        style={{ left: shift }}
        className="pointer-events-none invisible absolute bottom-full z-50 mb-2 w-64 max-w-[calc(100vw-16px)] translate-y-1 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[13px] leading-5 font-normal text-ink2 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-[opacity,transform] duration-200 ease-out-soft group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  )
}

export function Panel({
  title,
  aside,
  children,
  className,
  pad = true,
}: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  pad?: boolean
}) {
  return (
    <section className={cx('rounded-2xl border border-line bg-card', className)}>
      {title && (
        <header className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-[15px] font-medium text-ink">{title}</h2>
          {aside && <div className="text-[13px] text-ink3">{aside}</div>}
        </header>
      )}
      <div className={cx(pad && 'p-5', !!title && pad && 'pt-3')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="rise mb-8 flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-3xl">
        <h1 className="font-serif text-[34px] leading-[1.15] font-normal tracking-[-0.02em] text-ink">{title}</h1>
        {lede && <p className="mt-2 text-[15px] leading-[22px] text-ink2">{lede}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

type BtnProps = {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  title?: string
  className?: string
  type?: 'button' | 'submit'
  'aria-pressed'?: boolean
}

export function Btn({ children, onClick, variant = 'secondary', size = 'md', disabled, title, className, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={rest['aria-pressed']}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] font-medium whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out-soft select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-9 px-4 text-[14px]',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        variant === 'primary' && 'bg-chalk text-[#17150f] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:bg-white',
        variant === 'secondary' && 'border border-line-strong bg-raised text-ink hover:bg-hover',
        variant === 'ghost' && 'text-ink2 hover:bg-raised hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode; title?: string }>
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] border border-line bg-bg p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-lg px-3 font-medium transition-[background-color,color] duration-150 ease-out-soft',
              size === 'sm' ? 'h-7 text-[13px]' : 'h-8 text-[13px]',
              active ? 'bg-raised text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'text-ink3 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150 ease-out-soft',
        checked ? 'border-transparent bg-chalk' : 'border-line-strong bg-raised',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 size-3.5 rounded-full transition-transform duration-200 ease-out-soft',
          checked ? 'translate-x-4 bg-[#17150f]' : 'bg-ink2',
        )}
      />
    </button>
  )
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  hint,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format?: (v: number) => string
  hint?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <div className={cx('py-1', disabled && 'opacity-40')}>
      <div className="flex h-5 items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] text-ink2">
          {label}
          {hint && <Info>{hint}</Info>}
        </label>
        <output htmlFor={id} className="tnum font-mono text-[13px] text-ink">
          {format ? format(value) : value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Stat({ label, value, sub, tone, hint }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-[13px] text-ink3">
        {tone && <span className="size-2 rounded-full" style={{ background: tone }} />}
        {label}
        {hint && <Info>{hint}</Info>}
      </div>
      <div className="tnum mt-1 text-[28px] leading-8 font-medium tracking-[-0.01em] text-ink">{value}</div>
      {sub && <div className="tnum mt-0.5 font-mono text-[12px] leading-4 text-ink3">{sub}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line-strong bg-raised px-1.5 py-px font-mono text-[11px] leading-4 text-ink2 shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  )
}

/** Inline mono token for maths: M("β"). */
export function M({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.93em] whitespace-nowrap text-ink">{children}</span>
}

export function Formula({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="my-3">
      <div className="overflow-x-auto rounded-lg border border-line bg-bg px-4 py-3 font-mono text-[14px] leading-6 whitespace-pre-wrap break-words text-chalk">{children}</div>
      {caption && <figcaption className="mt-1.5 text-[13px] text-ink3">{caption}</figcaption>}
    </figure>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex h-9 items-center justify-between gap-3">
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] text-ink2">
        {label}
        {hint && <Info>{hint}</Info>}
      </label>
      <input
        id={id}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="tnum h-8 w-24 rounded-lg border border-line bg-bg px-2.5 text-right font-mono text-[13px] text-ink transition-colors duration-150 hover:border-line-strong focus:border-line-strong"
      />
    </div>
  )
}

export const fmtPct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`
export const fmtNum = (x: number, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
