import { CODE } from './engine/types'

/** Canvas and chart colours. Kept in sync with the CSS variables in index.css. */
export const COLORS = {
  S: '#4cc38a',
  I: '#e5484d',
  R: '#5b9cf6',
  ISO: '#f59e42',
  NEW: '#a78bfa',
  ink: '#ececee',
  ink2: '#a2a5ad',
  ink3: '#868a94',
  chalk: '#efeae0',
  grid: 'rgba(236,236,238,0.07)',
  canvas: '#0b0c0f',
} as const

export const CODE_COLOR: Record<number, string> = {
  [CODE.S]: COLORS.S,
  [CODE.I]: COLORS.I,
  [CODE.R]: COLORS.R,
  [CODE.ISOLATED]: COLORS.ISO,
  [CODE.NEW]: COLORS.NEW,
  [CODE.VACCINATED]: COLORS.R,
}

export const CODE_LABEL: Record<number, string> = {
  [CODE.S]: 'Susceptible',
  [CODE.I]: 'Infected',
  [CODE.R]: 'Recovered',
  [CODE.ISOLATED]: 'Isolated',
  [CODE.NEW]: 'Newly infected',
  [CODE.VACCINATED]: 'Vaccinated',
}

/** Series colours for comparing scenarios or variants: one lead colour, then quiet steps. */
export const SERIES = ['#efeae0', '#f59e42', '#5b9cf6', '#4cc38a', '#a78bfa', '#e5484d', '#7dd3c8', '#d6a5c9', '#b8b8bf', '#8d93a1']
