import { useRef, useState } from 'react'
import { Download, History, RotateCcw, Upload } from 'lucide-react'
import { useSnapshots } from '@/db/hooks'
import { exportBackup, importBackup, isBackup, restoreSnapshot, takeSnapshot } from '@/db/repo'
import { resetToExample } from '@/db/bootstrap'
import type { DetailLevel, ExportOptions, PromptFormat } from '@/db/types'
import { downloadFile } from '@/lib/clipboard'
import { relativeTime } from '@/lib/text'
import { useTheme, type Theme } from '@/lib/theme'
import { Button, Segmented, Switch } from '@/components/ui/primitives'
import { useConfirm, useToast } from '@/components/ui/overlays'
import { LibraryScreen } from '@/components/layout/AppShell'
import { Scroll } from '@/components/layout/Screen'
import { getGlobalExportDefaults, setGlobalExportDefaults } from '@/features/export/composer-context'

export function Settings() {
  const [theme, setTheme] = useTheme()
  const [defaults, setDefaults] = useState<ExportOptions>(getGlobalExportDefaults)
  const snapshots = useSnapshots()
  const toast = useToast()
  const { confirm, element } = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)

  const setDefault = <K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) => {
    const next = { ...defaults, [k]: v }
    setDefaults(next)
    setGlobalExportDefaults(next)
  }

  const download = async () => {
    const backup = await exportBackup()
    const date = new Date().toISOString().slice(0, 10)
    downloadFile(`trellis-backup-${date}.json`, JSON.stringify(backup, null, 2))
  }

  const onImport = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text())
      if (!isBackup(data)) throw new Error('Not a Trellis backup file.')
      if (!(await confirm('Replace everything with this backup?', { body: 'A snapshot of your current data is taken first, so you can undo this.', action: 'Import' }))) return
      await takeSnapshot('Before import')
      await importBackup(data)
      toast('Backup imported')
    } catch (e) {
      toast('Import failed', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <LibraryScreen title="Settings">
      <Scroll>
      <div className="mx-auto w-full max-w-2xl px-4 pb-16">

      <Block title="Appearance">
        <Segmented<Theme>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Block>

      <Block title="Prompt defaults">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[13px] text-muted">Format</span>
            <Segmented<PromptFormat>
              size="sm"
              value={defaults.format}
              onChange={(v) => setDefault('format', v)}
              options={[
                { value: 'markdown', label: 'Markdown' },
                { value: 'xml', label: 'XML tags' },
                { value: 'plain', label: 'Plain' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[13px] text-muted">Character detail</span>
            <Segmented<DetailLevel>
              size="sm"
              value={defaults.characterDetail}
              onChange={(v) => setDefault('characterDetail', v)}
              options={[
                { value: 'brief', label: 'Brief' },
                { value: 'standard', label: 'Standard' },
                { value: 'full', label: 'Full' },
              ]}
            />
          </div>
          <div className="max-w-md space-y-0.5 pt-2">
            <Switch checked={defaults.includeContinuity} onChange={(v) => setDefault('includeContinuity', v)} label="Include story so far" />
            <Switch checked={defaults.includeNextBeat} onChange={(v) => setDefault('includeNextBeat', v)} label="Include stop marker" />
            <Switch checked={defaults.includeWriterNotes} onChange={(v) => setDefault('includeWriterNotes', v)} label="Include private writer notes" />
          </div>
        </div>
      </Block>

      <Block title="Backup" description="Your work lives only in this browser. Download a backup now and then.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={download}>
            <Download /> Download backup
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload /> Import backup…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </Block>

      <Block
        title="Snapshots"
        description="Taken automatically, and before every import or restore."
        aside={
          <Button size="sm" onClick={async () => { await takeSnapshot('Manual'); toast('Snapshot saved') }}>
            <History /> Take snapshot
          </Button>
        }
      >
        {snapshots?.length === 0 && <p className="text-[13px] text-faint">No snapshots yet.</p>}
        <ul className="divide-y divide-line">
          {snapshots?.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5">
              <span>
                <span className="text-[13.5px]">{s.label}</span>
                <span className="ml-2 text-[12px] text-faint">
                  {new Date(s.createdAt).toLocaleString()} · {relativeTime(s.createdAt)} · {Math.round(s.data.length / 1024)} KB
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (await confirm('Restore this snapshot?', { body: 'Your current data is snapshotted first.', action: 'Restore' })) {
                    await restoreSnapshot(s.id)
                    toast('Snapshot restored')
                  }
                }}
              >
                <RotateCcw /> Restore
              </Button>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Example content">
        <Button
          variant="danger"
          onClick={async () => {
            if (await confirm('Reset to the example story?', { body: 'This replaces all your data with the demo. A snapshot is taken first.', action: 'Reset' })) {
              await takeSnapshot('Before reset')
              await resetToExample()
              toast('Example restored')
            }
          }}
        >
          Reset to example data
        </Button>
      </Block>
      {element}
      </div>
      </Scroll>
    </LibraryScreen>
  )
}

function Block({ title, description, children, aside }: { title: string; description?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-line py-7 first:border-t-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-[20px]">{title}</h2>
          {description && <p className="mt-0.5 max-w-lg text-[13px] text-muted">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
