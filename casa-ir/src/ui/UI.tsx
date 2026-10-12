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
import { IntroController, PresentationCaption, PresentationController } from './Presentation'

export function UI() {
  const progress = useStore((s) => s.progress)
  const capturing = useStore((s) => s.capturing)
  const panel = useStore((s) => s.panel)
  const toast = useStore((s) => s.toast)
  const dev = useStore((s) => s.dev)
  const intro = useStore((s) => s.intro)
  const presentation = useStore((s) => s.presentation)
  const fading = useStore((s) => s.fading)
  const focusActive = useStore((s) => s.focusActive)
  const loaded = progress >= 1
  return (
    <>
      <div className={`fade${fading && !capturing ? ' is-on' : ''}`} aria-hidden="true" />
      {!loaded && <Loading />}
      <IntroController />
      <PresentationController />
      {loaded && (
        <div className={`ui${capturing ? ' ui--hidden' : ''}${intro ? ' ui--intro' : ''}`}>
          {!presentation && (
            <>
              <TopBar />
              <ViewChips />
              <CompareBadge />
              {panel === 'ambientes' && <RoomsPanel />}
              {panel === 'acabamentos' && <FinishPanel />}
              {panel === 'opcoes' && <OptionsPanel />}
              <Toolbar />
              <WalkOverlay />
              {focusActive && panel !== 'acabamentos' && (
                <button className="btn focus-back" onClick={() => useStore.setState({ returnRequest: performance.now() })}>
                  Voltar à vista
                </button>
              )}
            </>
          )}
          <PresentationCaption />
          {toast && <div className="toast">{toast}</div>}
          {dev && <DevOverlay />}
        </div>
      )}
    </>
  )
}
