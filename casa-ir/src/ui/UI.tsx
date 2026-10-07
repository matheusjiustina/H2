/**
 * Client interface (Portuguese). Kept deliberately sparse so the architecture
 * stays the protagonist: brand + primary navigation, one side panel at a time,
 * a compact secondary toolbar and the always-visible "Restaurar projeto".
 */
import { useStore } from '../app/store'
import { Loading } from './Loading'
import { TopBar } from './TopBar'
import { ViewChips } from './ViewChips'
import { RoomsPanel } from './RoomsPanel'
import { FinishPanel } from './FinishPanel'
import { OptionsPanel } from './OptionsPanel'
import { Toolbar } from './Toolbar'
import { WalkOverlay } from './WalkOverlay'
import { CompareBadge } from './CompareBadge'
import { DevOverlay } from './DevOverlay'

export function UI() {
  const progress = useStore((s) => s.progress)
  const capturing = useStore((s) => s.capturing)
  const panel = useStore((s) => s.panel)
  const toast = useStore((s) => s.toast)
  const dev = useStore((s) => s.dev)
  const loaded = progress >= 1
  return (
    <>
      {!loaded && <Loading />}
      {loaded && (
        <div className={`ui${capturing ? ' ui--hidden' : ''}`}>
          <TopBar />
          <ViewChips />
          <CompareBadge />
          {panel === 'ambientes' && <RoomsPanel />}
          {panel === 'acabamentos' && <FinishPanel />}
          {panel === 'opcoes' && <OptionsPanel />}
          <Toolbar />
          <WalkOverlay />
          {toast && <div className="toast">{toast}</div>}
          {dev && <DevOverlay />}
        </div>
      )}
    </>
  )
}
