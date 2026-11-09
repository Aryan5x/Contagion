import { useState } from 'react'
import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Btn, Panel } from './ui'

export interface ExportItem {
  label: string
  /** What the file holds, shown as the button's tooltip. */
  title: string
  /** Builds and saves the file. Returning false reports that nothing could be saved. */
  run: () => void | boolean | Promise<boolean>
  disabled?: boolean
}

/** A row of download buttons. Files are built in the browser from the results on screen. */
export function ExportPanel({ items, note, title = 'Export' }: { items: ExportItem[]; note?: ReactNode; title?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <Panel title={title}>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Btn
            key={it.label}
            size="sm"
            title={it.title}
            disabled={it.disabled}
            onClick={async () => {
              setFailed(null)
              const ok = await it.run()
              if (ok === false) setFailed(`${it.label} could not be saved: the image is not ready yet. Wait a moment and try again.`)
            }}
          >
            <Download size={14} strokeWidth={1.5} />
            {it.label}
          </Btn>
        ))}
      </div>
      {failed && <p className="mt-2 text-[13px] text-i">{failed}</p>}
      {note && <p className="mt-3 text-[12px] leading-4 text-ink3">{note}</p>}
    </Panel>
  )
}
