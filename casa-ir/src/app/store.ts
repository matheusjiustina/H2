import { create } from 'zustand'
import type { ConfigMap, SavedOption, SlotChoice } from '../data/configuration'
import type { SlotId } from '../data/materials'

export type Mode = 'exterior' | 'interior'
export type Nav = 'orbit' | 'walk'
export type Quality = 'auto' | 'high' | 'medium' | 'low'
export type Tier = 'high' | 'medium' | 'low'
export type Panel = null | 'ambientes' | 'acabamentos' | 'opcoes' | 'vistas'

interface CameraRequest {
  id: string
  ts: number
  instant?: boolean
}

interface State {
  // loading
  progress: number
  progressLabel: string
  ready: boolean
  // navigation
  mode: Mode
  nav: Nav
  panel: Panel
  plan: boolean
  currentRoom: string | null
  cameraRequest: CameraRequest | null
  walkTeleport: { x: number; z: number; yaw: number; ts: number } | null
  // visuals
  night: boolean
  shadows: boolean
  quality: Quality
  autoTier: Tier
  // configurator
  selectedId: string | null
  clientConfig: ConfigMap
  options: Record<1 | 2 | 3, SavedOption | null>
  activeOption: 1 | 2 | 3 | null
  showOriginal: boolean
  // misc
  capturing: boolean
  toast: string | null
  dev: boolean
  isTouch: boolean

  set: (p: Partial<State>) => void
  goCamera: (id: string, instant?: boolean) => void
  select: (id: string | null) => void
  setChoice: (slot: SlotId, choice: SlotChoice | null) => void
  resetSlots: (slots: SlotId[]) => void
  resetAll: () => void
  saveOption: (n: 1 | 2 | 3) => void
  loadOption: (n: 1 | 2 | 3) => void
  clearOption: (n: 1 | 2 | 3) => void
  notify: (msg: string) => void
}

const LS_KEY = 'casa-ir:v1'

function loadPersisted(): Partial<State> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    return { clientConfig: o.clientConfig ?? {}, options: o.options ?? { 1: null, 2: null, 3: null }, activeOption: o.activeOption ?? null }
  } catch {
    return {}
  }
}

function persist(s: State) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ clientConfig: s.clientConfig, options: s.options, activeOption: s.activeOption }))
  } catch {
    /* storage unavailable — configuration still works for this session */
  }
}

const params = new URLSearchParams(location.search)
let toastTimer: number | undefined

export const useStore = create<State>((set, get) => ({
  progress: 0,
  progressLabel: 'Preparando…',
  ready: false,
  mode: 'exterior',
  nav: 'orbit',
  panel: null,
  plan: false,
  currentRoom: null,
  cameraRequest: { id: 'hero', ts: 0, instant: true },
  walkTeleport: null,
  night: false,
  shadows: true,
  quality: (params.get('q') as Quality) || 'auto',
  autoTier: 'medium',
  selectedId: null,
  clientConfig: {},
  options: { 1: null, 2: null, 3: null },
  activeOption: null,
  showOriginal: false,
  capturing: false,
  toast: null,
  dev: params.has('dev'),
  isTouch: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches,
  ...loadPersisted(),

  set: (p) => set(p),
  goCamera: (id, instant) => set({ cameraRequest: { id, ts: performance.now(), instant } }),
  select: (id) => set({ selectedId: id, panel: id ? 'acabamentos' : get().panel }),
  setChoice: (slot, choice) => {
    const cfg = { ...get().clientConfig }
    if (choice) cfg[slot] = choice
    else delete cfg[slot]
    set({ clientConfig: cfg, showOriginal: false })
    persist(get())
  },
  resetSlots: (slots) => {
    const cfg = { ...get().clientConfig }
    for (const s of slots) delete cfg[s]
    set({ clientConfig: cfg, showOriginal: false })
    persist(get())
  },
  resetAll: () => {
    set({ clientConfig: {}, showOriginal: false, activeOption: null })
    persist(get())
    get().notify('Projeto original restaurado')
  },
  saveOption: (n) => {
    const options = { ...get().options, [n]: { name: `Opção 0${n}`, savedAt: new Date().toISOString(), config: { ...get().clientConfig } } }
    set({ options, activeOption: n })
    persist(get())
    get().notify(`Opção 0${n} salva`)
  },
  loadOption: (n) => {
    const o = get().options[n]
    if (!o) return
    set({ clientConfig: { ...o.config }, activeOption: n, showOriginal: false })
    persist(get())
    get().notify(`Opção 0${n} carregada`)
  },
  clearOption: (n) => {
    const options = { ...get().options, [n]: null }
    set({ options, activeOption: get().activeOption === n ? null : get().activeOption })
    persist(get())
  },
  notify: (msg) => {
    set({ toast: msg })
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => set({ toast: null }), 2600)
  },
}))

/** The configuration currently rendered (original project while comparing). */
const ORIGINAL: ConfigMap = Object.freeze({}) as ConfigMap
export function activeConfig(s: Pick<State, 'showOriginal' | 'clientConfig'>): ConfigMap {
  return s.showOriginal ? ORIGINAL : s.clientConfig
}

export function effectiveTier(s: Pick<State, 'quality' | 'autoTier'>): Tier {
  return s.quality === 'auto' ? s.autoTier : s.quality
}

// expose for automated visual QA (harmless in production)
;(window as unknown as { __casa: typeof useStore }).__casa = useStore
