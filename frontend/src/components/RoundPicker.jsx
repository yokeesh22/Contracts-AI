import { AlertTriangle, ChevronDown, Loader2, Upload } from 'lucide-react'
import Menu, { MenuDivider, MenuItem } from './Menu'
import { cn } from '../lib/utils'

const RUNNING = ['queued', 'pending', 'extracting', 'analyzing']

const roundLabel = (v) => (v.round_number === 1 ? 'Opening paper' : 'Vendor response')

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null

/**
 * Which round you are reading, as a control that says so.
 *
 * This replaced a rail of numbered circles where every round but the open one
 * was a bare digit. It fit, and it told you nothing: a "1" next to a "2" does
 * not explain that these are two versions of a contract, and the "+" that added
 * the counterparty's reply was unguessable. A named trigger and a named list
 * cost one click and remove the guessing.
 */
export default function RoundPicker({
  versions = [],
  selectedId,
  onSelect,
  onAddRound,
  canAddRound = false,
}) {
  if (!versions.length) return null

  const current = versions.find((v) => v.id === selectedId) ?? versions[versions.length - 1]
  const isLatest = current.id === versions[versions.length - 1].id
  const running = RUNNING.includes(current.status)

  return (
    <Menu
      width={300}
      align="left"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title="Switch between the versions exchanged in this negotiation"
          className={cn(
            'flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] transition-colors hover:bg-secondary',
            open && 'bg-secondary',
          )}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary font-mono-num text-[9.5px] font-semibold text-white">
              {current.round_number}
            </span>
          )}
          <span className="whitespace-nowrap font-medium text-foreground">
            Round {current.round_number} of {versions.length}
          </span>
          <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">
            · {roundLabel(current)}
          </span>
          {!isLatest && (
            <span className="rounded bg-muted px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              past
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      )}
    >
      {[...versions].reverse().map((version) => {
        const active = version.id === current.id
        return (
          <MenuItem
            key={version.id}
            // Every round wears its own number, and the open one wears it in
            // the same blue badge the trigger shows. A tick on one row and
            // nothing on the others left them at different indents.
            leading={
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full font-mono-num text-[9.5px] font-semibold',
                  active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {version.round_number}
              </span>
            }
            label={`Round ${version.round_number} — ${roundLabel(version)}`}
            hint={[
              shortDate(version.created_at),
              `${version.total_clauses} findings`,
              version.sent_at ? `sent ${shortDate(version.sent_at)}` : null,
              version.round_number > 1 && !version.has_tracked_changes
                ? 'no tracked changes — compared on text alone'
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            onClick={() => onSelect?.(version.id)}
          />
        )
      })}

      {canAddRound && (
        <>
          <MenuDivider />
          <MenuItem
            icon={Upload}
            label="Upload the vendor's response…"
            hint="Starts the next round and compares it against what we sent"
            onClick={onAddRound}
          />
        </>
      )}
    </Menu>
  )
}

/** Amber marker for a returned file that carried no revision marks. */
export function NoMarkupWarning({ version }) {
  if (!version || version.round_number === 1 || version.has_tracked_changes) return null
  return (
    <span
      title="This version came back without tracked changes, so the comparison is based on the text alone. Check anything marked Countered."
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium"
      style={{ background: '#fefce8', color: '#a16207' }}
    >
      <AlertTriangle className="h-3 w-3" />
      No markup
    </span>
  )
}
