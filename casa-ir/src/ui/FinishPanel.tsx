/**
 * ACABAMENTOS — material configurator.
 * With an object selected: its finishes, alternative swatches, custom colour
 * and "Restaurar projeto". Without a selection: the configurable items of the
 * current room (or of the exterior), so the client can pick from a list too.
 */
import { useMemo, useState } from 'react'
import { useStore, activeConfig } from '../app/store'
import { SELECTABLES, SELECTABLE_BY_ID, isOriginal, resolveChoice } from '../data/configuration'
import { FINISHES, OPTIONS, SLOTS, type FinishId, type SlotId } from '../data/materials'
import { ROOM_BY_ID } from '../data/houseSpec'
import { swatchStyle } from './swatch'
import { IconBack, IconClose, IconRestore, IconCheck, IconFocus } from './icons'
import { NEUTRAL_PALETTE } from '../data/palette'
import { renderState } from '../scene/renderState'
import { selectableBounds } from '../configurator/Selection'

export function FinishPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const set = useStore((s) => s.set)
  const select = useStore((s) => s.select)
  const currentRoom = useStore((s) => s.currentRoom)
  const mode = useStore((s) => s.mode)
  const cfg = useStore((s) => activeConfig(s))
  const sel = selectedId ? SELECTABLE_BY_ID[selectedId] : null

  return (
    <aside className="panel panel--finishes" aria-label="Acabamentos">
      <div className="panel__head">
        <div>
          <div className="eyebrow">{sel ? roomLabel(sel.room) : 'Personalização'}</div>
          <h2>{sel ? sel.label : 'Acabamentos'}</h2>
        </div>
        <div className="head-actions">
          {sel && (
            <button className="icon-btn" onClick={() => select(null)} aria-label="Voltar à lista">
              <IconBack />
            </button>
          )}
          <button className="icon-btn" onClick={() => set({ panel: null, selectedId: null })} aria-label="Fechar">
            <IconClose />
          </button>
        </div>
      </div>
      <div className="panel__body">{sel ? <ObjectEditor id={sel.id} /> : <ItemList room={currentRoom ?? (mode === 'exterior' ? 'exterior' : null)} cfg={cfg} />}</div>
    </aside>
  )
}

function roomLabel(room: string) {
  return room === 'exterior' ? 'Área externa' : ROOM_BY_ID[room]?.name ?? ''
}

function ItemList({ room, cfg }: { room: string | null; cfg: ReturnType<typeof activeConfig> }) {
  const select = useStore((s) => s.select)
  const [all, setAll] = useState(false)
  const groups = useMemo(() => {
    const g = new Map<string, typeof SELECTABLES>()
    for (const s of SELECTABLES) {
      if (!all && room && s.room !== room) continue
      const k = s.room
      if (!g.has(k)) g.set(k, [])
      g.get(k)!.push(s)
    }
    return [...g.entries()]
  }, [room, all])
  return (
    <>
      <p className="hint">Toque ou clique em um objeto da cena para personalizá-lo, ou escolha na lista abaixo.</p>
      {room && (
        <div className="seg">
          <button className={!all ? 'is-active' : ''} onClick={() => setAll(false)}>
            {roomLabel(room)}
          </button>
          <button className={all ? 'is-active' : ''} onClick={() => setAll(true)}>
            Todos
          </button>
        </div>
      )}
      {(groups.length ? groups : SELECTABLES.length ? [[room ?? '', []] as [string, typeof SELECTABLES]] : []).map(([k, items]) => (
        <section className="group" key={k}>
          {(all || !room) && <div className="group__title">{roomLabel(k)}</div>}
          {items.map((s) => {
            const custom = s.slots.some((sl) => !isOriginal(cfg, sl))
            const f = FINISHES[resolveChoice(cfg, s.slots[0]).finish]
            return (
              <button key={s.id} className="item" onClick={() => select(s.id)}>
                <span className="swatch swatch--sm" style={swatchStyle(resolveChoice(cfg, s.slots[0]).finish, cfg[s.slots[0]]?.color)} />
                <span className="item__label">
                  {s.label}
                  <small>{f.label}</small>
                </span>
                {custom && <span className="badge">alterado</span>}
              </button>
            )
          })}
        </section>
      ))}
    </>
  )
}

function ObjectEditor({ id }: { id: string }) {
  const sel = SELECTABLE_BY_ID[id]
  const cfg = useStore((s) => activeConfig(s))
  const showOriginal = useStore((s) => s.showOriginal)
  const focusActive = useStore((s) => s.focusActive)
  const resetSlots = useStore((s) => s.resetSlots)
  const allOriginal = sel.slots.every((sl) => isOriginal(cfg, sl))
  const detail = () => {
    const sc = renderState.scene
    const b = sc ? selectableBounds(sc, id, useStore.getState().currentRoom) : null
    if (b) useStore.setState({ focusRequest: { ...b, ts: performance.now() } })
  }
  return (
    <>
      <div className="row row--tight">
        {!focusActive ? (
          <button className="btn btn--ghost btn--sm" onClick={detail}>
            <IconFocus /> Ver detalhe
          </button>
        ) : (
          <button className="btn btn--ghost btn--sm" onClick={() => useStore.setState({ returnRequest: performance.now() })}>
            <IconBack /> Voltar à vista
          </button>
        )}
        <span className={`state${allOriginal ? '' : ' state--custom'}`}>{allOriginal ? 'Projeto original' : 'Personalizado'}</span>
      </div>
      {showOriginal && <p className="note">Você está visualizando o <b>Projeto Original</b>. Alterações voltam a exibir a sua opção.</p>}
      {sel.slots.map((slot) => (
        <SlotEditor key={slot} slot={slot} />
      ))}
      <button className="btn btn--ghost btn--block" disabled={allOriginal} onClick={() => resetSlots(sel.slots)}>
        <IconRestore /> Restaurar original
      </button>
    </>
  )
}

function SlotEditor({ slot }: { slot: SlotId }) {
  const def = SLOTS[slot]
  const cfg = useStore((s) => activeConfig(s))
  const setChoice = useStore((s) => s.setChoice)
  const choice = resolveChoice(cfg, slot)
  const original = def.finish
  const options: FinishId[] = def.options ? (OPTIONS[def.options] as FinishId[]) : [original]
  const list = options.filter((f) => f !== original)
  const choose = (f: FinishId) => setChoice(slot, f === original && !choice.color ? null : { finish: f, color: choice.color })
  const tint = (hex: string | null) => setChoice(slot, choice.finish === original && !hex ? null : { finish: choice.finish, color: hex ?? undefined })
  const isOrig = choice.finish === original && !choice.color
  return (
    <div className="slot">
      <div className="slot__label">{def.label}</div>
      <button className={`orig${isOrig ? ' is-active' : ''}`} onClick={() => setChoice(slot, null)} title="Voltar ao acabamento do projeto">
        <span className="swatch swatch--sm" style={swatchStyle(original)} />
        <span className="orig__text">
          <span className="orig__eyebrow">Projeto original</span>
          {FINISHES[original].label}
        </span>
        {isOrig ? <IconCheck /> : <span className="orig__act">Restaurar</span>}
      </button>
      {list.length > 0 && (
        <>
          <div className="sub">Opções</div>
          <div className="swatches" role="radiogroup" aria-label={def.label}>
            {list.map((f) => (
              <button key={f} role="radio" aria-checked={choice.finish === f} className={`swatch${choice.finish === f ? ' is-active' : ''}`} style={swatchStyle(f, choice.finish === f ? choice.color : undefined)} title={FINISHES[f].label} onClick={() => choose(f)}>
                {choice.finish === f && <IconCheck />}
                <span className="swatch__name">{FINISHES[f].label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {def.custom && (
        <>
          <div className="sub">Personalizar cor</div>
          <div className="palette" role="radiogroup" aria-label="Personalizar cor">
            {NEUTRAL_PALETTE.map((c) => {
              const active = c.hex ? choice.color === c.hex : !choice.color
              return (
                <button key={c.id} role="radio" aria-checked={active} className={`dot${active ? ' is-active' : ''}${c.hex ? '' : ' dot--orig'}`} style={c.hex ? { background: c.hex } : swatchStyle(choice.finish)} title={c.label} aria-label={c.label} onClick={() => tint(c.hex)} />
              )
            })}
          </div>
          <div className="palette__name">{NEUTRAL_PALETTE.find((c) => (c.hex ? choice.color === c.hex : !choice.color))?.label ?? 'Cor personalizada'}</div>
        </>
      )}
    </div>
  )
}
