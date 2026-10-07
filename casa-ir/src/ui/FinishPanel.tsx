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
import { IconBack, IconClose, IconRestore, IconCheck } from './icons'

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
  const resetSlots = useStore((s) => s.resetSlots)
  const allOriginal = sel.slots.every((sl) => isOriginal(cfg, sl))
  return (
    <>
      {showOriginal && <p className="note">Você está visualizando o <b>Projeto Original</b>. Alterações voltam a exibir a sua opção.</p>}
      {sel.slots.map((slot) => (
        <SlotEditor key={slot} slot={slot} />
      ))}
      <button className="btn btn--ghost btn--block" disabled={allOriginal} onClick={() => resetSlots(sel.slots)}>
        <IconRestore /> Restaurar projeto deste item
      </button>
      <p className="status">{allOriginal ? 'Conforme o projeto original (PDF).' : 'Acabamento personalizado pelo cliente.'}</p>
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
  const list = options.includes(original) ? options : [original, ...options]
  const choose = (f: FinishId) => setChoice(slot, f === original ? null : { finish: f })
  const current = FINISHES[choice.finish]
  return (
    <div className="slot">
      <div className="slot__head">
        <span className="slot__label">{def.label}</span>
        <span className="slot__current">
          {current.label}
          {choice.color ? ' · cor personalizada' : ''}
        </span>
      </div>
      <div className="swatches" role="radiogroup" aria-label={def.label}>
        {list.map((f) => (
          <button
            key={f}
            role="radio"
            aria-checked={choice.finish === f && !choice.color}
            className={`swatch${choice.finish === f && !choice.color ? ' is-active' : ''}`}
            style={swatchStyle(f)}
            title={FINISHES[f].label + (f === original ? ' (projeto)' : '')}
            onClick={() => choose(f)}
          >
            {f === original && <span className="swatch__tag">projeto</span>}
            {choice.finish === f && !choice.color && <IconCheck />}
          </button>
        ))}
      </div>
      {def.custom && (
        <label className="custom">
          <span>Cor personalizada</span>
          <input
            type="color"
            value={choice.color ?? FINISHES[choice.finish].swatch ?? FINISHES[choice.finish].color}
            onChange={(e) => setChoice(slot, { finish: choice.finish, color: e.target.value })}
          />
        </label>
      )}
    </div>
  )
}
